// Proxy seguro para el chat de la web.
// - La clave vive solo en Netlify (ANTHROPIC_API_KEY).
// - El modelo, las instrucciones del asistente y los límites los fija el servidor:
//   el navegador solo envía los mensajes de la conversación.
import SYSTEM_PROMPT from './chat-prompt.js';

const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-5-5';
const MAX_TOKENS = 1500;
const MAX_MESSAGES = 12;
const MAX_CHARS = 2000;
const ALLOWED_ORIGINS = [
  'https://levanta-lamancha.es',
  'https://www.levanta-lamancha.es',
];

function cors(origin) {
  let allowed = ALLOWED_ORIGINS.includes(origin);
  try { allowed = allowed || /\.netlify\.app$/.test(new URL(origin).hostname); } catch { /* origen vacío */ }
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

  // Solo se aceptan mensajes de texto de usuario/asistente, recortados.
  const messages = (Array.isArray(input.messages) ? input.messages : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }))
    .slice(-MAX_MESSAGES);
  if (messages.length === 0 || messages[0].role !== 'user' || messages[messages.length - 1].role !== 'user') {
    return json({ error: { message: 'Mensajes no válidos' } }, 400, origin);
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: SYSTEM_PROMPT, messages }),
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
