import { createAdminClient } from '../_shared/supabase.ts';
import { handleOptions, jsonResponse, requireAdminKey } from '../_shared/http.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return handleOptions(request);
  }

  if (request.method !== 'GET') {
    return jsonResponse(request, { error: 'Method not allowed.' }, { status: 405 });
  }

  const unauthorized = requireAdminKey(request);
  if (unauthorized) {
    return unauthorized;
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get('limit') || 50), 100);
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('trends')
    .select('id,rank,keyword,status,category,tags,summary,score,published,updated_at')
    .order('published', { ascending: false })
    .order('rank', { ascending: true })
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    return jsonResponse(request, { error: error.message }, { status: 500 });
  }

  return jsonResponse(request, { trends: data ?? [] });
});
