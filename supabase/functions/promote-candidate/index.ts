import { createAdminClient } from '../_shared/supabase.ts';
import { handleOptions, jsonResponse, requireAdminKey } from '../_shared/http.ts';

type PromoteCandidatePayload = {
  normalized_keyword?: string;
  rank?: number | null;
  status?: string;
  category?: string;
  summary?: string | null;
  publish?: boolean;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return handleOptions();
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, { status: 405 });
  }

  const unauthorized = requireAdminKey(request);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await request.json() as PromoteCandidatePayload;

  if (!payload.normalized_keyword) {
    return jsonResponse({ error: 'normalized_keyword is required.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('promote_candidate_to_trend', {
    p_normalized_keyword: payload.normalized_keyword,
    p_rank: payload.rank ?? null,
    p_status: payload.status ?? '상승 중',
    p_category: payload.category ?? '뉴스',
    p_summary: payload.summary ?? null,
    p_publish: payload.publish ?? false,
  });

  if (error) {
    return jsonResponse({ error: error.message }, { status: 500 });
  }

  return jsonResponse({ trend_id: data });
});
