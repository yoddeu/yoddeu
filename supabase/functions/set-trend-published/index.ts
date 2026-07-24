import { createAdminClient } from '../_shared/supabase.ts';
import { handleOptions, jsonResponse, requireAdminKey } from '../_shared/http.ts';

type SetTrendPublishedPayload = {
  trend_id?: string;
  published?: boolean;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return handleOptions(request);
  }

  if (request.method !== 'POST') {
    return jsonResponse(request, { error: 'Method not allowed.' }, { status: 405 });
  }

  const unauthorized = requireAdminKey(request);
  if (unauthorized) {
    return unauthorized;
  }

  const payload = await request.json() as SetTrendPublishedPayload;

  if (!payload.trend_id) {
    return jsonResponse(request, { error: 'trend_id is required.' }, { status: 400 });
  }

  if (typeof payload.published !== 'boolean') {
    return jsonResponse(request, { error: 'published must be a boolean.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('trends')
    .update({ published: payload.published })
    .eq('id', payload.trend_id)
    .select('id,rank,keyword,status,category,tags,summary,score,published,updated_at')
    .single();

  if (error) {
    return jsonResponse(request, { error: error.message }, { status: 500 });
  }

  return jsonResponse(request, { trend: data });
});
