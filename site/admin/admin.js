const sampleCandidates = [
  {
    normalized_keyword: 'ai 영상',
    keyword: 'AI 영상',
    mention_count: 18,
    source_count: 4,
    article_count: 9,
    score: 38.5,
    sample_titles: [
      'AI 영상 생성 도구, 크리에이터 사이에서 급부상',
      '숏폼 제작에 AI 영상 도구 활용 증가',
    ],
  },
  {
    normalized_keyword: '폭염 대응',
    keyword: '폭염 대응',
    mention_count: 12,
    source_count: 3,
    article_count: 7,
    score: 25.75,
    sample_titles: [
      '전국 폭염에 냉방비와 야외 활동 안전 관심 증가',
      '무더위 대응 생활 정보 검색 늘어',
    ],
  },
];

const state = {
  candidates: sampleCandidates,
};

const grid = document.querySelector('[data-candidate-grid]');
const template = document.querySelector('[data-candidate-template]');
const jsonInput = document.querySelector('[data-candidate-json]');
const loadButton = document.querySelector('[data-load-json]');
const resetButton = document.querySelector('[data-reset-sample]');
const message = document.querySelector('[data-message]');

function escapeSql(value) {
  return String(value).replaceAll("'", "''");
}

function buildPromotionSql(candidate, category, status, summary) {
  return `select public.promote_candidate_to_trend(\n  p_normalized_keyword := '${escapeSql(candidate.normalized_keyword)}',\n  p_category := '${escapeSql(category)}',\n  p_status := '${escapeSql(status)}',\n  p_summary := '${escapeSql(summary)}',\n  p_publish := false\n);`;
}

function normalizeCandidate(candidate) {
  return {
    normalized_keyword: candidate.normalized_keyword ?? candidate.normalizedKeyword ?? '',
    keyword: candidate.keyword ?? candidate.normalized_keyword ?? '이름 없는 후보',
    mention_count: Number(candidate.mention_count ?? candidate.mentionCount ?? 0),
    source_count: Number(candidate.source_count ?? candidate.sourceCount ?? 0),
    article_count: Number(candidate.article_count ?? candidate.articleCount ?? 0),
    score: Number(candidate.score ?? 0),
    sample_titles: candidate.sample_titles ?? candidate.sampleTitles ?? [],
  };
}

function createCandidateCard(candidate) {
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector('.candidate-card');
  const category = fragment.querySelector('[data-category]');
  const status = fragment.querySelector('[data-status]');
  const summary = fragment.querySelector('[data-summary]');
  const sql = fragment.querySelector('[data-sql]');
  const copyButton = fragment.querySelector('[data-copy-sql]');
  const sampleTitles = fragment.querySelector('[data-sample-titles]');

  fragment.querySelector('[data-keyword]').textContent = candidate.keyword;
  fragment.querySelector('[data-score]').textContent = `점수 ${candidate.score.toFixed(2)}`;
  fragment.querySelector('[data-mention-count]').textContent = candidate.mention_count;
  fragment.querySelector('[data-source-count]').textContent = candidate.source_count;
  fragment.querySelector('[data-article-count]').textContent = candidate.article_count;

  summary.value = `${candidate.keyword} 관련 언급이 증가하고 있어요.`;
  candidate.sample_titles.slice(0, 5).forEach((title) => {
    const item = document.createElement('li');
    item.textContent = title;
    sampleTitles.append(item);
  });

  function updateSql() {
    sql.textContent = buildPromotionSql(candidate, category.value, status.value, summary.value);
  }

  category.addEventListener('change', updateSql);
  status.addEventListener('change', updateSql);
  summary.addEventListener('input', updateSql);
  copyButton.addEventListener('click', async () => {
    await navigator.clipboard.writeText(sql.textContent);
    message.textContent = `${candidate.keyword} 승격 SQL을 복사했어요.`;
  });

  updateSql();
  return card;
}

function renderCandidates() {
  grid.replaceChildren(...state.candidates.map(createCandidateCard));
}

function loadCandidatesFromJson() {
  try {
    const parsed = JSON.parse(jsonInput.value);
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    state.candidates = candidates.map(normalizeCandidate).filter((candidate) => candidate.normalized_keyword);
    renderCandidates();
    message.textContent = `${state.candidates.length}개 후보를 불러왔어요.`;
  } catch (error) {
    message.textContent = `JSON을 읽지 못했어요: ${error.message}`;
  }
}

loadButton.addEventListener('click', loadCandidatesFromJson);
resetButton.addEventListener('click', () => {
  state.candidates = sampleCandidates;
  jsonInput.value = '';
  renderCandidates();
  message.textContent = '샘플 후보를 다시 표시했어요.';
});

renderCandidates();
