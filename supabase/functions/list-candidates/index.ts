import { createAdminClient } from '../_shared/supabase.ts';
import { handleOptions, jsonResponse, requireAdminKey } from '../_shared/http.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return handleOptions();
  }

  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed.' }, { status: 405 });
  }

  const unauthorized = requireAdminKey(request);
  if (unauthorized) {
    return unauthorized;
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get('limit') || 30), 100);
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('trend_candidate_summary')
    .select('*')
    .order('score', { ascending: false })
    .order('latest_collected_at', { ascending: false })
    .limit(limit);

  if (error) {
    return jsonResponse({ error: error.message }, { status: 500 });
  }

  return jsonResponse({ candidates: data ?? [] });
});
