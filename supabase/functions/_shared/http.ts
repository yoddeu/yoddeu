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
    'access-control-allow-methods': 'GET, POST, OPTIONS',
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

function handleOptions(request: Request) {
  return new Response('ok', { headers: corsHeaders(request) });
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

export { corsHeaders, handleOptions, jsonResponse, requireAdminKey };
