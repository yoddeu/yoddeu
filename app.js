const state = {
  trends: [],
  category: '전체',
  query: '',
};

const trendGrid = document.querySelector('[data-trend-grid]');
const filterBar = document.querySelector('[data-filter-bar]');
const searchInput = document.querySelector('[data-search-input]');
const updatedText = document.querySelector('[data-updated-text]');
const emptyState = document.querySelector('[data-empty-state]');

const statusClassMap = {
  급상승: 'badge--hot',
  '밈 확산': 'badge--meme',
};

function formatSources(sources) {
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

function renderUpdatedAt() {
  const latest = state.trends
    .map((trend) => new Date(trend.updatedAt))
    .sort((a, b) => b - a)[0];

  if (latest) {
    updatedText.textContent = `${formatUpdatedAt(latest)} 업데이트 · 수동/반자동 큐레이션`;
  }
}

async function loadTrends() {
  try {
    const response = await fetch('data/trends.json');
    if (!response.ok) throw new Error('트렌드 데이터를 불러오지 못했습니다.');

    state.trends = await response.json();
    renderUpdatedAt();
    renderFilters();
    renderTrends();
  } catch (error) {
    trendGrid.innerHTML = '<p class="empty-state">트렌드 데이터를 불러오지 못했어요. 로컬 서버 또는 GitHub Pages에서 다시 확인해 주세요.</p>';
    console.error(error);
  }
}

searchInput.addEventListener('input', (event) => {
  state.query = event.target.value;
  renderTrends();
});

loadTrends();
