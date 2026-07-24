import { createClient } from 'npm:@supabase/supabase-js@2';

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch (_error) {
    return value.replace(/\/$/, '');
  }
}

function getAllowedOrigin(request: Request) {
  const requestOrigin = request.headers.get('origin') || '*';
  const configuredOrigins = (Deno.env.get('ADMIN_ALLOWED_ORIGIN') || '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map(normalizeOrigin);

  if (configuredOrigins.includes('*')) {
    return '*';
  }

  const normalizedRequestOrigin = normalizeOrigin(requestOrigin);
  return configuredOrigins.includes(normalizedRequestOrigin) ? normalizedRequestOrigin : configuredOrigins[0];
}

function corsHeaders(request: Request) {
  return {
    'access-control-allow-origin': getAllowedOrigin(request),
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-admin-key',
    'access-control-allow-methods': 'GET, OPTIONS',
    vary: 'Origin',
  };
}

function jsonResponse(request: Request, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders(request),
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

function requireAdminKey(request: Request) {
  const expectedKey = Deno.env.get('ADMIN_API_KEY');
  const actualKey = request.headers.get('x-admin-key');

  if (!expectedKey) {
    return jsonResponse(request, { error: 'ADMIN_API_KEY is not configured.' }, { status: 500 });
  }

  if (actualKey !== expectedKey) {
    return jsonResponse(request, { error: 'Unauthorized admin request.' }, { status: 401 });
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
    return new Response('ok', { headers: corsHeaders(request) });
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
