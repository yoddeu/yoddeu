const state = {
  trends: [],
  category: '전체',
  query: '',
};

const trendGrid = document.querySelector('[data-trend-grid]');
const filterBar = document.querySelector('[data-filter-bar]');
const searchInput = document.querySelector('[data-search-input]');
const updatedText = document.querySelector('[data-updated-text]');
const sourceText = document.querySelector('[data-source-text]');
const emptyState = document.querySelector('[data-empty-state]');
const menuToggle = document.querySelector('[data-menu-toggle]');
const menu = document.querySelector('[data-menu]');


function setMenuOpen(isOpen) {
  menuToggle.setAttribute('aria-expanded', String(isOpen));
  menu.classList.toggle('is-open', isOpen);
}

menuToggle.addEventListener('click', () => {
  const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
  setMenuOpen(!isOpen);
});

menu.addEventListener('click', (event) => {
  if (event.target.matches('a')) {
    setMenuOpen(false);
  }
});

const config = window.YODDEU_CONFIG ?? {};

const statusClassMap = {
  급상승: 'badge--hot',
  '밈 확산': 'badge--meme',
};

function formatSources(sources = []) {
  if (sources.length === 0) {
    return '출처 집계 준비 중';
  }

  return sources.map((source) => `${source.name} ${source.count}`).join(' · ');
}

function formatUpdatedAt(value) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function escapeHtml(value) {
  const element = document.createElement('span');
  element.textContent = value;
  return element.innerHTML;
}

function createTrendCard(trend) {
  const article = document.createElement('article');
  article.className = `trend-card${trend.rank === 1 ? ' trend-card--featured' : ''}`;

  const badgeClass = statusClassMap[trend.status] ?? '';
  const tags = [trend.category, ...trend.tags].join(' · ');
  const safeStatus = escapeHtml(trend.status);
  const safeKeyword = escapeHtml(trend.keyword);
  const safeSummary = escapeHtml(trend.summary);
  const safeTags = escapeHtml(tags);
  const safeSources = escapeHtml(formatSources(trend.sources));

  article.innerHTML = `
    <div class="trend-card__topline">
      <strong class="rank">#${trend.rank}</strong>
      <span class="badge ${badgeClass}">${safeStatus}</span>
    </div>
    <h3>${safeKeyword}</h3>
    <p>${safeSummary}</p>
    <div class="trend-card__meta">
      <span>${safeTags}</span>
      <span>${safeSources}</span>
    </div>
  `;

  return article;
}

function getFilteredTrends() {
  const normalizedQuery = state.query.trim().toLowerCase();

  return state.trends.filter((trend) => {
    const matchesCategory = state.category === '전체' || trend.category === state.category;
    const searchableText = [trend.keyword, trend.category, ...trend.tags, trend.summary].join(' ').toLowerCase();
    const matchesQuery = !normalizedQuery || searchableText.includes(normalizedQuery);

    return matchesCategory && matchesQuery;
  });
}

function renderTrends() {
  const filteredTrends = getFilteredTrends();
  trendGrid.replaceChildren(...filteredTrends.map(createTrendCard));
  emptyState.hidden = filteredTrends.length > 0;
}

function renderFilters() {
  const categories = ['전체', ...new Set(state.trends.map((trend) => trend.category))];

  filterBar.replaceChildren(
    ...categories.map((category) => {
      const button = document.createElement('button');
      button.className = `filter${category === state.category ? ' is-active' : ''}`;
      button.type = 'button';
      button.textContent = category;
      button.addEventListener('click', () => {
        state.category = category;
        renderFilters();
        renderTrends();
      });
      return button;
    }),
  );
}

function mapSupabaseTrend(row) {
  const sources = row.trend_sources ?? [];

  return {
    rank: row.rank,
    keyword: row.keyword,
    status: row.status,
    category: row.category,
    tags: row.tags ?? [],
    summary: row.summary,
    sources: sources.map((source) => ({
      name: source.source_name || source.source_type,
      count: source.count ?? 0,
    })),
    updatedAt: row.updated_at,
  };
}

function hasSupabaseConfig() {
  return Boolean(config.SUPABASE_URL && config.SUPABASE_ANON_KEY);
}

async function fetchSupabaseTrends() {
  const baseUrl = config.SUPABASE_URL.replace(/\/$/, '');
  const query = new URLSearchParams({
    select: 'rank,keyword,status,category,tags,summary,score,updated_at,trend_sources(source_type,source_name,count)',
    published: 'eq.true',
    order: 'rank.asc',
  });

  const response = await fetch(`${baseUrl}/rest/v1/trends?${query}`, {
    headers: {
      apikey: config.SUPABASE_ANON_KEY,
      authorization: `Bearer ${config.SUPABASE_ANON_KEY}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase 트렌드 데이터를 불러오지 못했습니다: ${response.status} ${body}`);
  }

  return (await response.json()).map(mapSupabaseTrend);
}

async function fetchFallbackTrends() {
  const response = await fetch('data/trends.json');
  if (!response.ok) throw new Error('트렌드 데이터를 불러오지 못했습니다.');

  return response.json();
}

async function fetchTrends() {
  if (!hasSupabaseConfig()) {
    return {
      trends: await fetchFallbackTrends(),
      source: 'fallback',
      message: 'Supabase 설정이 없어 샘플 데이터를 표시 중입니다.',
    };
  }

  try {
    const trends = await fetchSupabaseTrends();

    if (trends.length > 0) {
      return {
        trends,
        source: 'supabase',
        message: 'Supabase 공개 트렌드를 표시 중입니다.',
      };
    }

    return {
      trends: await fetchFallbackTrends(),
      source: 'fallback',
      message: '공개된 Supabase 트렌드가 없어 샘플 데이터를 표시 중입니다.',
    };
  } catch (error) {
    console.warn(error);
    return {
      trends: await fetchFallbackTrends(),
      source: 'fallback',
      message: 'Supabase 데이터를 불러오지 못해 샘플 데이터를 표시 중입니다.',
    };
  }
}

function renderUpdatedAt() {
  const latest = state.trends
    .map((trend) => new Date(trend.updatedAt))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b - a)[0];

  if (latest) {
    updatedText.textContent = `${formatUpdatedAt(latest)} 업데이트 · 수동/반자동 큐레이션`;
  } else {
    updatedText.textContent = '업데이트 시간 확인 중 · 수동/반자동 큐레이션';
  }
}

function renderSourceStatus(result) {
  sourceText.textContent = result.message;
  sourceText.dataset.source = result.source;
}

async function loadTrends() {
  try {
    const result = await fetchTrends();
    state.trends = result.trends;
    renderUpdatedAt();
    renderSourceStatus(result);
    renderFilters();
    renderTrends();
  } catch (error) {
    trendGrid.innerHTML = '<p class="empty-state">트렌드 데이터를 불러오지 못했어요. 로컬 서버 또는 GitHub Pages에서 다시 확인해 주세요.</p>';
    sourceText.textContent = '트렌드 데이터를 불러오지 못했습니다.';
    sourceText.dataset.source = 'error';
    console.error(error);
  }
}

searchInput.addEventListener('input', (event) => {
  state.query = event.target.value;
  renderTrends();
});

loadTrends();
