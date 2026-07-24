import { createAdminClient } from '../_shared/supabase.ts';
import { handleOptions, jsonResponse, requireAdminKey } from '../_shared/http.ts';

type UpdateTrendPayload = {
  trend_id?: string;
  rank?: number | null;
  keyword?: string;
  status?: string;
  category?: string;
  summary?: string;
  tags?: string[];
};

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : undefined;
}

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

  const payload = await request.json() as UpdateTrendPayload;

  if (!payload.trend_id) {
    return jsonResponse(request, { error: 'trend_id is required.' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  const keyword = cleanText(payload.keyword);
  const status = cleanText(payload.status);
  const category = cleanText(payload.category);
  const summary = cleanText(payload.summary);

  if (keyword) updates.keyword = keyword;
  if (status) updates.status = status;
  if (category) updates.category = category;
  if (typeof summary === 'string') updates.summary = summary;
  if (typeof payload.rank === 'number' && Number.isFinite(payload.rank)) updates.rank = payload.rank;
  if (Array.isArray(payload.tags)) {
    updates.tags = payload.tags
      .map((tag) => cleanText(tag))
      .filter((tag): tag is string => Boolean(tag));
  }

  if (Object.keys(updates).length === 0) {
    return jsonResponse(request, { error: 'No editable fields were provided.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('trends')
    .update(updates)
    .eq('id', payload.trend_id)
    .select('id,rank,keyword,status,category,tags,summary,score,published,updated_at')
    .single();

  if (error) {
    return jsonResponse(request, { error: error.message }, { status: 500 });
  }

  return jsonResponse(request, { trend: data });
});
