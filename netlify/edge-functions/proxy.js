// Proxy seguro para el chat de la web.
// - La clave vive solo en Netlify (ANTHROPIC_API_KEY).
// - El modelo, las instrucciones del asistente y los límites los fija el servidor:
//   el navegador solo envía los mensajes de la conversación.
import SYSTEM_PROMPT from '../lib/chat-prompt.js';
import { getStore } from '@netlify/blobs';

const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-5-5';
const MAX_TOKENS = 1500;
const MAX_MESSAGES = 12;
const MAX_CHARS = 2000;

// Límite en el servidor (el del navegador se puede saltar borrando datos):
// - por IP y día: algo más holgado que las 3 preguntas de la web, porque varias
//   personas pueden compartir IP (oficina, red móvil);
// - total diario: tope de coste aunque alguien cambie de IP.
const MAX_PER_IP_DAY = 6;
const MAX_TOTAL_DAY = 300;
const LIMIT_MSG = 'Has llegado al límite de preguntas de hoy. Agenda una llamada gratuita en calendly.com/pprensas o escríbeme a levantalamancha@levanta.email.';

const today = () => new Date().toISOString().slice(0, 10);

// No se guarda la IP: solo un hash con sal secreta y la fecha, que no permite recuperarla.
async function ipKey(ip, day) {
  const salt = Deno.env.get('CHAT_LIMIT_SALT') || Deno.env.get('ANTHROPIC_API_KEY') || '';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}|${day}|${ip}`));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function limitStore() {
  try { return getStore({ name: 'levanta-chat-limits', consistency: 'strong' }); }
  catch { return getStore('levanta-chat-limits'); }
}

// Devuelve true si se supera el límite. Si el almacenamiento falla, deja pasar (el chat no se rompe).
async function overLimit(ip, context) {
  try {
    const store = limitStore();
    const day = today();
    const kIp = `${day}/ip-${await ipKey(ip || 'sin-ip', day)}`;
    const kTotal = `${day}/total`;
    const [a, t] = await Promise.all([store.get(kIp), store.get(kTotal)]);
    const nIp = parseInt(a || '0', 10), nTotal = parseInt(t || '0', 10);
    if (nIp >= MAX_PER_IP_DAY || nTotal >= MAX_TOTAL_DAY) return true;
    await Promise.all([store.set(kIp, String(nIp + 1)), store.set(kTotal, String(nTotal + 1))]);
    // Limpieza ocasional de los contadores de días anteriores
    if (Math.random() < 0.05) {
      const cleanup = (async () => {
        const { blobs } = await store.list();
        await Promise.all(blobs.filter((b) => !b.key.startsWith(day + '/')).map((b) => store.delete(b.key)));
      })().catch((e) => console.error('proxy: limpieza de límites', e && e.message));
      if (context && context.waitUntil) context.waitUntil(cleanup);
    }
    return false;
  } catch (e) {
    console.error('proxy: límite no disponible, se permite la petición', e && e.message);
    return false;
  }
}
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

export default async (request, context) => {
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

  if (await overLimit(context && context.ip, context)) {
    return json({ error: { type: 'rate_limit', message: LIMIT_MSG } }, 429, origin);
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
