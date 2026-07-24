import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCandidates, dedupeCandidates, extractKeywords, parseFeedItems } from '../src/index.js';

const sampleRss = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>요뜨 테스트 뉴스</title>
    <item>
      <title><![CDATA[AI 영상 생성 도구, 크리에이터 사이에서 급부상]]></title>
      <link>https://example.com/news/ai-video</link>
      <pubDate>Thu, 23 Jul 2026 09:00:00 +0900</pubDate>
    </item>
  </channel>
</rss>`;

test('parseFeedItems extracts RSS items', () => {
  const items = parseFeedItems(sampleRss, 'https://example.com/rss');

  assert.equal(items.length, 1);
  assert.equal(items[0].sourceName, '요뜨 테스트 뉴스');
  assert.equal(items[0].sourceUrl, 'https://example.com/news/ai-video');
});

test('extractKeywords returns normalized keyword candidates', () => {
  const keywords = extractKeywords('AI 영상 생성 도구, 크리에이터 사이에서 급부상');

  assert.ok(keywords.some((item) => item.normalizedKeyword === 'ai'));
  assert.ok(keywords.some((item) => item.normalizedKeyword.includes('영상')));
});

test('buildCandidates maps feed items to Supabase rows', () => {
  const items = parseFeedItems(sampleRss, 'https://example.com/rss');
  const candidates = buildCandidates(items, 'https://example.com/rss');

  assert.ok(candidates.length > 0);
  assert.equal(candidates[0].source_type, 'news_rss');
  assert.equal(candidates[0].source_url, 'https://example.com/news/ai-video');
});


test('dedupeCandidates removes duplicate upsert keys before Supabase insert', () => {
  const items = parseFeedItems(sampleRss, 'https://example.com/rss');
  const candidates = buildCandidates(items, 'https://example.com/rss');
  const duplicated = [...candidates, ...candidates.map((candidate) => ({ ...candidate }))];
  const deduped = dedupeCandidates(duplicated);

  assert.equal(deduped.length, candidates.length);
  assert.ok(deduped.every((candidate) => candidate.mention_count === 2));
});


test('collect handles empty successful Supabase responses', async () => {
  const originalFetch = globalThis.fetch;
  const feedUrl = 'https://example.com/rss';
  process.env.NEWS_RSS_URLS = feedUrl;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

  globalThis.fetch = async (url) => {
    const value = String(url);

    if (value === feedUrl) {
      return new Response(sampleRss, { status: 200 });
    }

    if (value.includes('/rest/v1/collection_runs') && value.includes('id=eq.')) {
      return new Response(null, { status: 204 });
    }

    if (value.endsWith('/rest/v1/collection_runs')) {
      return new Response(JSON.stringify([{ id: 'run-1' }]), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (value.includes('/rest/v1/trend_candidates')) {
      return new Response('', { status: 201 });
    }

    throw new Error(`unexpected fetch URL: ${value}`);
  };

  try {
    const { collect } = await import('../src/index.js');
    const candidates = await collect({ dryRun: false });
    assert.ok(candidates.length > 0);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.NEWS_RSS_URLS;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
});
