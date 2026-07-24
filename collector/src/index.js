const DEFAULT_STOPWORDS = new Set([
  '그리고', '그러나', '하지만', '오늘', '내일', '이번', '지난', '관련', '속보', '단독',
  '사진', '뉴스', '종합', '기자', '공개', '발표', '논란', '이슈', '진행', '대한', '위한',
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'news', 'korea', 'latest',
]);

const SOURCE_TYPE = 'news_rss';

function getEnv(name, fallback = '') {
  return process.env[name] || fallback;
}

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run') || getEnv('COLLECTOR_DRY_RUN') === 'true',
  };
}

function getFeedUrls() {
  return getEnv('NEWS_RSS_URLS')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
}

function stripCdata(value) {
  return value.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}

function decodeXml(value) {
  return stripCdata(value)
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

function getTagValue(xml, tagName) {
  const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = xml.match(pattern);
  return match ? decodeXml(match[1]) : '';
}

function getAtomLink(entryXml) {
  const match = entryXml.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
  return match ? decodeXml(match[1]) : '';
}

function parseFeedItems(xml, feedUrl) {
  const sourceName = getTagValue(xml, 'title') || new URL(feedUrl).hostname;
  const blocks = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)];

  return blocks.map((match) => {
    const block = match[2];
    const isAtom = match[1].toLowerCase() === 'entry';

    return {
      title: getTagValue(block, 'title'),
      sourceUrl: getTagValue(block, 'link') || (isAtom ? getAtomLink(block) : ''),
      publishedAt: getTagValue(block, 'pubDate') || getTagValue(block, 'published') || getTagValue(block, 'updated') || null,
      sourceName,
    };
  }).filter((item) => item.title && item.sourceUrl);
}

function normalizeKeyword(value) {
  return value.toLowerCase().replace(/[^0-9a-z가-힣]+/gi, ' ').trim().replace(/\s+/g, ' ');
}

function tokenize(title) {
  return title
    .replace(/\[[^\]]+\]|【[^】]+】|\([^)]*\)/g, ' ')
    .split(/[^0-9a-zA-Z가-힣]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .filter((token) => !DEFAULT_STOPWORDS.has(token.toLowerCase()));
}

function extractKeywords(title, limit = 3) {
  const tokens = tokenize(title);
  const phrases = [];

  for (let index = 0; index < tokens.length; index += 1) {
    phrases.push(tokens[index]);
    if (tokens[index + 1]) {
      phrases.push(`${tokens[index]} ${tokens[index + 1]}`);
    }
  }

  return [...new Set(phrases)]
    .map((keyword) => ({ keyword, normalizedKeyword: normalizeKeyword(keyword) }))
    .filter((item) => item.normalizedKeyword.length >= 2)
    .slice(0, limit);
}

function buildCandidates(items, feedUrl) {
  return items.flatMap((item) => {
    const keywords = extractKeywords(item.title);

    return keywords.map(({ keyword, normalizedKeyword }) => ({
      keyword,
      normalized_keyword: normalizedKeyword,
      category_guess: null,
      source_type: SOURCE_TYPE,
      source_name: item.sourceName,
      source_url: item.sourceUrl,
      title: item.title,
      summary_raw: item.title,
      mention_count: 1,
      engagement_count: 0,
      collected_at: new Date().toISOString(),
      feed_url: feedUrl,
    }));
  });
}

async function fetchFeed(feedUrl) {
  const response = await fetch(feedUrl, {
    headers: {
      'user-agent': 'yoddeu-collector/0.1 (+https://github.com/yoddeu/yoddeu)',
      accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${feedUrl}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function supabaseRequest(path, options = {}) {
  const supabaseUrl = getEnv('SUPABASE_URL').replace(/\/$/, '');
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required unless --dry-run is used.');
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${body}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function createCollectionRun(dryRun) {
  if (dryRun) {
    return { id: 'dry-run' };
  }

  const rows = await supabaseRequest('collection_runs', {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify([{ collector_name: 'news-rss', status: 'running' }]),
  });

  return rows[0];
}

async function finishCollectionRun(runId, payload, dryRun) {
  if (dryRun || !runId) {
    return;
  }

  await supabaseRequest(`collection_runs?id=eq.${runId}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...payload, finished_at: new Date().toISOString() }),
  });
}

async function saveCandidates(candidates, dryRun) {
  if (dryRun || candidates.length === 0) {
    return;
  }

  const rows = candidates.map(({ feed_url: _feedUrl, ...candidate }) => candidate);

  await supabaseRequest('trend_candidates?on_conflict=normalized_keyword,source_type,source_url', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(rows),
  });
}

async function collect({ dryRun }) {
  const feedUrls = getFeedUrls();

  if (feedUrls.length === 0) {
    throw new Error('NEWS_RSS_URLS must contain at least one RSS or Atom feed URL.');
  }

  const run = await createCollectionRun(dryRun);
  const allCandidates = [];

  try {
    for (const feedUrl of feedUrls) {
      const xml = await fetchFeed(feedUrl);
      const items = parseFeedItems(xml, feedUrl);
      allCandidates.push(...buildCandidates(items, feedUrl));
    }

    await saveCandidates(allCandidates, dryRun);
    await finishCollectionRun(run.id, {
      status: 'success',
      candidates_found: allCandidates.length,
      candidates_saved: allCandidates.length,
      metadata: { feed_count: feedUrls.length },
    }, dryRun);

    return allCandidates;
  } catch (error) {
    await finishCollectionRun(run.id, {
      status: 'failed',
      candidates_found: allCandidates.length,
      candidates_saved: 0,
      error_message: error.message,
      metadata: { feed_count: feedUrls.length },
    }, dryRun);
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));

  collect(args)
    .then((candidates) => {
      console.log(`Collected ${candidates.length} trend candidates.`);
      if (args.dryRun) {
        console.log(JSON.stringify(candidates.slice(0, 5), null, 2));
      }
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

export { buildCandidates, collect, extractKeywords, parseFeedItems };
