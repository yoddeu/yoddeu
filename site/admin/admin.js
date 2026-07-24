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
const edgeBaseUrlInput = document.querySelector('[data-edge-base-url]');
const anonKeyInput = document.querySelector('[data-anon-key]');
const adminKeyInput = document.querySelector('[data-admin-key]');
const loadEdgeButton = document.querySelector('[data-load-edge]');
const saveAdminSettingsButton = document.querySelector('[data-save-admin-settings]');
const config = window.YODDEU_CONFIG ?? {};

function escapeSql(value) {
  return String(value).replaceAll("'", "''");
}

function getDefaultEdgeBaseUrl() {
  if (config.EDGE_FUNCTION_BASE_URL) {
    return config.EDGE_FUNCTION_BASE_URL;
  }

  if (config.SUPABASE_URL) {
    return `${config.SUPABASE_URL.replace(/\/$/, '')}/functions/v1`;
  }

  return '';
}

function formatEdgeError(error) {
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return 'Edge Function에 연결하지 못했어요. base URL, 함수 배포 여부, ADMIN_ALLOWED_ORIGIN(CORS), Supabase anon key, x-admin-key를 확인해 주세요.';
  }

  return error.message;
}

function getAdminSettings() {
  return {
    edgeBaseUrl: edgeBaseUrlInput.value.trim().replace(/\/$/, ''),
    adminKey: adminKeyInput.value.trim(),
  };
}

function saveAdminSettings() {
  const settings = getAdminSettings();
  sessionStorage.setItem('yoddeu_admin_edge_base_url', settings.edgeBaseUrl);
  sessionStorage.setItem('yoddeu_admin_anon_key', settings.anonKey);
  sessionStorage.setItem('yoddeu_admin_key', settings.adminKey);
  message.textContent = '관리자 설정을 현재 브라우저 세션에 저장했어요.';
}

function restoreAdminSettings() {
  edgeBaseUrlInput.value = sessionStorage.getItem('yoddeu_admin_edge_base_url') || getDefaultEdgeBaseUrl();
  anonKeyInput.value = sessionStorage.getItem('yoddeu_admin_anon_key') || config.SUPABASE_ANON_KEY || '';
  adminKeyInput.value = sessionStorage.getItem('yoddeu_admin_key') || '';
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

async function edgeRequest(path, options = {}) {
  const { edgeBaseUrl, anonKey, adminKey } = getAdminSettings();

  if (!edgeBaseUrl || !adminKey) {
    throw new Error('Edge Function base URL과 Admin API Key를 입력해 주세요.');
  }

  const authHeaders = anonKey ? {
    apikey: anonKey,
    authorization: `Bearer ${anonKey}`,
  } : {};

  const response = await fetch(`${edgeBaseUrl}${path}`, {
    ...options,
    headers: {
      ...authHeaders,
      'x-admin-key': adminKey,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const body = await response.text();
  const data = body ? JSON.parse(body) : {};

  if (!response.ok) {
    if (data.error === 'Missing authorization') {
      throw new Error('Supabase anon/publishable key가 필요합니다. 관리자 설정에 anon key를 입력해 주세요.');
    }

    throw new Error(data.error || `Edge Function 요청 실패: ${response.status}`);
  }

  return data;
}

async function loadCandidatesFromEdge() {
  try {
    saveAdminSettings();
    const data = await edgeRequest('/list-candidates?limit=30', { method: 'GET' });
    state.candidates = (data.candidates ?? []).map(normalizeCandidate).filter((candidate) => candidate.normalized_keyword);
    renderCandidates();
    message.textContent = `${state.candidates.length}개 후보를 Edge Function에서 불러왔어요.`;
  } catch (error) {
    message.textContent = formatEdgeError(error);
  }
}

async function promoteCandidateWithEdge(candidate, category, status, summary) {
  const data = await edgeRequest('/promote-candidate', {
    method: 'POST',
    body: JSON.stringify({
      normalized_keyword: candidate.normalized_keyword,
      category,
      status,
      summary,
      publish: false,
    }),
  });

  return data.trend_id;
}

function createCandidateCard(candidate) {
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector('.candidate-card');
  const category = fragment.querySelector('[data-category]');
  const status = fragment.querySelector('[data-status]');
  const summary = fragment.querySelector('[data-summary]');
  const sql = fragment.querySelector('[data-sql]');
  const copyButton = fragment.querySelector('[data-copy-sql]');
  const promoteButton = fragment.querySelector('[data-promote-edge]');
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
  promoteButton.addEventListener('click', async () => {
    try {
      promoteButton.disabled = true;
      const trendId = await promoteCandidateWithEdge(candidate, category.value, status.value, summary.value);
      message.textContent = `${candidate.keyword} 후보를 초안으로 승격했어요. trend_id=${trendId}`;
    } catch (error) {
      message.textContent = formatEdgeError(error);
    } finally {
      promoteButton.disabled = false;
    }
  });

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

restoreAdminSettings();
loadEdgeButton.addEventListener('click', loadCandidatesFromEdge);
saveAdminSettingsButton.addEventListener('click', saveAdminSettings);
loadButton.addEventListener('click', loadCandidatesFromJson);
resetButton.addEventListener('click', () => {
  state.candidates = sampleCandidates;
  jsonInput.value = '';
  renderCandidates();
  message.textContent = '샘플 후보를 다시 표시했어요.';
});

renderCandidates();
