import { getStore } from "@netlify/blobs";

// ── CONFIGURACIÓN DE SERVICIOS ────────────────────────────────────────────────
const SERVICIOS = [
  {
    id: 1,
    nombre: 'Eficiencia Operativa y Finanzas',
    icono: '⚙️',
    keywords: 'pyme costes energía inflación ahorro automatización finanzas empresa',
  },
  {
    id: 2,
    nombre: 'Información y Datos',
    icono: '📊',
    keywords: 'empresa digitalización datos tecnología transformación digital innovación',
  },
  {
    id: 3,
    nombre: 'Experiencia del Cliente',
    icono: '⭐',
    keywords: 'consumidor cliente empresa ventas comercio tendencias mercado',
  },
  {
    id: 4,
    nombre: 'Digitalización e IT',
    icono: '💻',
    keywords: 'ciberseguridad inteligencia artificial empresa software tecnología pyme',
  },
  {
    id: 5,
    nombre: 'Talento y Liderazgo',
    icono: '🤝',
    keywords: 'empleo trabajo salarios empresa contratación trabajadores mercado laboral',
  },
  {
    id: 6,
    nombre: 'Imagen de Marca y Presencia Online',
    icono: '🎯',
    keywords: 'marketing digital redes sociales empresa marca publicidad online',
  },
];

// ── FUNCIÓN: BUSCAR EN NEWSAPI (últimos 30 días) ──────────────────────────────
async function buscarNoticias(query, apiKey, pageSize = 5) {
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const params = new URLSearchParams({
    q: query,
    language: 'es',
    sortBy: 'publishedAt',
    from,
    pageSize: String(pageSize),
    apiKey,
  });
  let data;
  try {
    const resp = await fetch(`https://newsapi.org/v2/everything?${params}`, { signal: AbortSignal.timeout(8000) });
    data = await resp.json();
  } catch (e) {
    console.error('NewsAPI error:', e && e.message);
    return [];
  }
  if (data.status !== 'ok') {
    console.error('NewsAPI no ok:', data.code, data.message);
    return [];
  }
  return (data.articles || []).filter(a =>
    a.title && a.url && !a.title.includes('[Removed]') && a.source?.name
  );
}

// ── FORMATEAR FECHA del artículo ──────────────────────────────────────────────
function formatFecha(isoDate) {
  if (!isoDate) return '';
  try {
    return new Date(isoDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

function isToday(isoDate) {
  if (!isoDate) return false;
  const today = new Date().toISOString().split('T')[0];
  return isoDate.slice(0, 10) === today;
}

// Extrae las noticias del texto de la IA. Si la respuesta llegó cortada, recupera
// los objetos completos que sí llegaron (cada objeto es plano, sin llaves anidadas).
function parsePicks(text) {
  const full = text.match(/\[[\s\S]*\]/);
  if (full) {
    try {
      const arr = JSON.parse(full[0]);
      if (Array.isArray(arr)) return arr;
    } catch { /* se intenta la recuperación */ }
  }
  const out = [];
  for (const m of text.matchAll(/\{[^{}]*\}/g)) {
    try {
      const o = JSON.parse(m[0]);
      if (o && o.id != null && o.elegido != null) out.push(o);
    } catch { /* objeto incompleto, se ignora */ }
  }
  return out;
}

// ── FUNCIÓN PRINCIPAL: renovación SEMANAL ───────────────────────────────────
// Reglas:
//  1. Solo se publican noticias REALES: título/fuente/URL/fecha salen del artículo de NewsAPI
//     (la IA solo elige cuál y redacta el titular y el resumen).
//  2. Si para un servicio no hay ningún artículo nuevo, se mantiene la noticia existente.
//  3. Las noticias añadidas en esta ejecución llevan addedAt = ahora (la web las marca "NEW").
const MAX_USED = 200;

export async function generateNews() {
  const NEWS_API_KEY = process.env.NEWS_API_KEY;
  if (!NEWS_API_KEY) throw new Error('NEWS_API_KEY no configurada en Netlify');
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY no configurada en Netlify');

  const store = getStore({ name: 'levanta-news', consistency: 'strong' });
  const today = new Date().toISOString().split('T')[0];
  const nowIso = new Date().toISOString();
  const fechaEs = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Estado actual (lo que ya está publicado)
  let current = { news: [], usedUrls: [] };
  try {
    const raw = await store.get('current');
    if (raw) current = JSON.parse(raw);
  } catch (e) {
    console.error('No se pudo leer el estado actual:', e && e.message);
  }
  const existingById = new Map((current.news || []).map(n => [n.id, n]));
  const used = new Set([...(current.usedUrls || []), ...(current.news || []).map(n => n.url).filter(Boolean)]);

  // ── PASO 1: artículos reales por servicio, en paralelo ──────────────────────
  const porServicio = await Promise.all(SERVICIOS.map(async (svc) => {
    const kw = svc.keywords.split(' ')[0];
    const [manchaResults, provinciaAll, nacionalResults] = await Promise.all([
      buscarNoticias(`("castilla la mancha" OR "la mancha") (${svc.keywords})`, NEWS_API_KEY, 3),
      buscarNoticias(`(Toledo OR Guadalajara OR Cuenca OR Albacete OR "Ciudad Real") (${svc.keywords})`, NEWS_API_KEY, 3),
      buscarNoticias(`${kw} empresa españa`, NEWS_API_KEY, 5),
    ]);
    const provinciaResults = manchaResults.length ? [] : provinciaAll;
    const existing = existingById.get(svc.id);

    const seen = new Set();
    const nuevos = [...manchaResults, ...provinciaResults, ...nacionalResults].filter(a => {
      if (seen.has(a.url)) return false;
      seen.add(a.url);
      if (used.has(a.url)) return false;                       // ya publicada antes
      if (!/^https?:\/\//.test(a.url)) return false;
      // no sustituir por algo más antiguo que lo que ya está publicado
      if (existing && existing.fechaArticulo && (a.publishedAt || '').slice(0, 10) < existing.fechaArticulo) return false;
      return true;
    }).slice(0, 5);

    return {
      servicio: svc,
      articulos: nuevos,
      tieneProvincia: provinciaResults.length > 0,
      tieneLaMancha: manchaResults.length > 0 || provinciaResults.length > 0,
    };
  }));

  const conNuevos = porServicio.filter(x => x.articulos.length > 0);

  // ── PASO 2: la IA elige un artículo por servicio y redacta titular y resumen ──
  let picks = [];
  if (conNuevos.length > 0) {
    const resumenArticulos = conNuevos.map(({ servicio, articulos, tieneProvincia, tieneLaMancha }) => {
      const lista = articulos.map((a, i) =>
        `  [${i + 1}] Fuente: ${a.source.name} | Título: ${a.title} | Descripción: ${(a.description || '').slice(0, 300)} | Fecha: ${a.publishedAt?.slice(0, 10)}`
      ).join('\n');
      const nota = tieneProvincia
        ? '⭐ artículos de PROVINCIA (Toledo/Guadalajara/Cuenca/Albacete/Ciudad Real)'
        : tieneLaMancha
          ? '⭐⭐ artículos de La Mancha (región)'
          : '(sin resultados locales, usar el mejor nacional)';
      return `SERVICIO ${servicio.id} - ${servicio.nombre} ${nota}:\n${lista}`;
    }).join('\n\n');

    const prompt = `Hoy es ${fechaEs}. Eres editor de noticias para PYMEs de La Mancha (vino, aceite, manufactura, agroalimentario, turismo rural, servicios locales).

Aquí tienes artículos reales de medios españoles. Para cada servicio, elige el artículo MÁS RELEVANTE para el empresario manchego (si ninguno es relevante, omite ese servicio) y redacta titular y resumen.

REGLAS CRÍTICAS:
- Usa SOLO la información del artículo elegido. No inventes datos, cifras ni citas.
- "elegido" es el número [n] del artículo dentro de su servicio.
- Prioridad: provincia específica > región La Mancha > nacional.

ARTÍCULOS NUEVOS:
${resumenArticulos}

RESPONDE SOLO con un array JSON sin markdown:
[{"id":1,"elegido":1,"titular":"titular periodístico, máx. 85 caracteres","resumen":"2 frases: qué dice el artículo y por qué importa a una PYME manchega.","cta":"pregunta directa al empresario"}]`;

    const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        model: process.env.NEWS_MODEL || 'claude-haiku-5-5',
        max_tokens: 8000,   // margen para el razonamiento interno del modelo + las 6 noticias
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const claudeData = await claudeResp.json();
    if (claudeData.error) throw new Error('Claude error: ' + claudeData.error.message);
    const text = (claudeData.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    if (claudeData.stop_reason === 'max_tokens') console.warn('news: respuesta cortada por max_tokens, se intentará recuperar');
    picks = parsePicks(text);
    if (!picks.length) throw new Error('Claude no devolvió JSON válido. Raw: ' + text.slice(0, 300));
  }

  // ── PASO 3: fusionar con lo existente ───────────────────────────────────────
  const merged = [];
  let added = 0;
  for (const svc of SERVICIOS) {
    const bloque = porServicio.find(x => x.servicio.id === svc.id);
    const pick = picks.find(p => Number(p.id) === svc.id);
    const art = pick && bloque ? bloque.articulos[Number(pick.elegido) - 1] : null;
    if (art && pick.titular && pick.resumen && !used.has(art.url)) {   // no repetir la misma noticia en dos servicios
      merged.push({
        id: svc.id,
        servicio: svc.nombre,
        icono: svc.icono,
        titular: String(pick.titular).slice(0, 140),
        resumen: String(pick.resumen).slice(0, 500),
        cta: String(pick.cta || '').slice(0, 200),
        fuente: art.source.name,               // siempre del artículo real
        url: art.url,                          // siempre del artículo real
        fechaArticulo: (art.publishedAt || '').slice(0, 10),
        fecha: formatFecha(art.publishedAt),
        addedAt: nowIso,
      });
      used.add(art.url);
      added++;
    } else if (existingById.has(svc.id)) {
      merged.push(existingById.get(svc.id));   // nada nuevo: se mantiene la existente
    }
  }

  const payload = {
    news: merged,
    updated: added > 0 ? nowIso : (current.updated || nowIso),
    lastRun: nowIso,
    usedUrls: [...used].slice(-MAX_USED),
  };
  await store.set('current', JSON.stringify(payload));
  // Compatibilidad con la newsletter semanal, que lee la clave del día
  await store.set(today, JSON.stringify({ news: merged, date: today, generated: nowIso }));

  return { ok: true, date: today, added, kept: merged.length - added, total: merged.length };
}
