const allowedOrigin = Deno.env.get('ADMIN_ALLOWED_ORIGIN') || '*';

const corsHeaders = {
  'access-control-allow-origin': allowedOrigin,
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-admin-key',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
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

function handleOptions() {
  return new Response('ok', { headers: corsHeaders });
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

export { corsHeaders, handleOptions, jsonResponse, requireAdminKey };
