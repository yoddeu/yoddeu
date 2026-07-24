import { createClient } from 'npm:@supabase/supabase-js@2';

const allowedOrigin = Deno.env.get('ADMIN_ALLOWED_ORIGIN') || '*';

const corsHeaders = {
  'access-control-allow-origin': allowedOrigin,
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-admin-key',
  'access-control-allow-methods': 'GET, OPTIONS',
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
