// Proxy seguro para la API de Anthropic (chat de la web y noticias).
// - La clave vive solo en Netlify (ANTHROPIC_API_KEY).
// - El modelo y los límites se fijan en el servidor, no en el navegador.
const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-5-5';
const MAX_TOKENS_CAP = 3000;
const ALLOWED_ORIGINS = [
  'https://levanta-lamancha.es',
  'https://www.levanta-lamancha.es',
];

function cors(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) || /\.netlify\.app$/.test(new URL(origin || 'https://x.invalid').hostname);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(origin) },
  });
}

export default async (request) => {
  const origin = request.headers.get('origin') || '';

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors(origin) });
  }
  if (request.method !== 'POST') {
    return json({ error: { message: 'Method not allowed' } }, 405, origin);
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    console.error('proxy: ANTHROPIC_API_KEY no está configurada en Netlify');
    return json({ error: { message: 'Servicio no configurado' } }, 500, origin);
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return json({ error: { message: 'JSON no válido' } }, 400, origin);
  }

  if (!Array.isArray(input.messages) || input.messages.length === 0 || input.messages.length > 40) {
    return json({ error: { message: 'Mensajes no válidos' } }, 400, origin);
  }

  // Solo se aceptan los campos que necesitamos; el modelo lo decide el servidor.
  const body = {
    model: MODEL,
    max_tokens: Math.min(Number(input.max_tokens) || 1000, MAX_TOKENS_CAP),
    messages: input.messages,
  };
  if (typeof input.system === 'string') body.system = input.system.slice(0, 20000);
  if (Array.isArray(input.tools)) {
    // Solo se permite la búsqueda web (para la sección de noticias).
    body.tools = input.tools
      .filter((t) => t && t.name === 'web_search')
      .map(() => ({ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }));
    if (body.tools.length === 0) delete body.tools;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('proxy: error de Anthropic', response.status, JSON.stringify(data).slice(0, 500));
    }
    return json(data, response.status, origin);
  } catch (e) {
    console.error('proxy: fallo de red', e && e.message);
    return json({ error: { message: 'No se pudo contactar con el servicio' } }, 502, origin);
  }
};

export const config = { path: '/api/proxy' };
