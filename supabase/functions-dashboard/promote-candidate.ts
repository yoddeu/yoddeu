import { createClient } from 'npm:@supabase/supabase-js@2';

const allowedOrigin = Deno.env.get('ADMIN_ALLOWED_ORIGIN') || '*';

const corsHeaders = {
  'access-control-allow-origin': allowedOrigin,
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-admin-key',
  'access-control-allow-methods': 'POST, OPTIONS',
};

type PromoteCandidatePayload = {
  normalized_keyword?: string;
  rank?: number | null;
  status?: string;
  category?: string;
  summary?: string | null;
  publish?: boolean;
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

function requireAdminKey(request: Request) {
  const expectedKey = Deno.env.get('ADMIN_API_KEY');
  const actualKey = request.headers.get('x-admin-key');

  if (!expectedKey) {
    return jsonResponse({ error: 'ADMIN_API_KEY is not configured.' }, { status: 500 });
  }

  if (actualKey !== expectedKey) {
    return jsonResponse({ error: 'Unauthorized admin request.' }, { status: 401 });
  }

  return null;
}

function createAdminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, { status: 405 });
  }

  const unauthorized = requireAdminKey(request);
  if (unauthorized) {
    return unauthorized;
  }

  let payload: PromoteCandidatePayload;

  try {
    payload = await request.json() as PromoteCandidatePayload;
  } catch (_error) {
    return jsonResponse({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

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
