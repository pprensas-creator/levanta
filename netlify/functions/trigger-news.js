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
  const resp = await fetch(`https://newsapi.org/v2/everything?${params}`);
  const data = await resp.json();
  if (data.status !== 'ok') return [];
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

// ── FUNCIÓN PRINCIPAL ─────────────────────────────────────────────────────────
export default async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get('key') !== process.env.TRIGGER_KEY) {
    return new Response('Unauthorized', { status: 401 });
  }

  const NEWS_API_KEY = process.env.NEWS_API_KEY;
  if (!NEWS_API_KEY) {
    return new Response(JSON.stringify({ error: 'NEWS_API_KEY no configurada en Netlify' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const fechaEs = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // ── PASO 1: Recopilar artículos reales por servicio (últimos 30 días) ────
    const articulosPorServicio = [];

    for (const svc of SERVICIOS) {
      // Búsqueda 1: La Mancha + keywords (prioridad)
      const manchaQuery = `("castilla la mancha" OR "la mancha") (${svc.keywords})`;
      const manchaResults = await buscarNoticias(manchaQuery, NEWS_API_KEY, 3);

      // Búsqueda 2: España nacional (fallback)
      const nacionalQuery = `(${svc.keywords}) españa`;
      const nacionalResults = await buscarNoticias(nacionalQuery, NEWS_API_KEY, 5);

      // Combinar: La Mancha primero, luego nacional (sin duplicados por URL)
      const seen = new Set();
      const combinados = [...manchaResults, ...nacionalResults].filter(a => {
        if (seen.has(a.url)) return false;
        seen.add(a.url);
        return true;
      }).slice(0, 5);

      articulosPorServicio.push({
        servicio: svc,
        articulos: combinados,
        tieneLaMancha: manchaResults.length > 0,
      });
    }

    // ── PASO 2: Formatear artículos para el prompt de Claude ─────────────────
    const resumenArticulos = articulosPorServicio.map(({ servicio, articulos, tieneLaMancha }) => {
      if (!articulos.length) {
        return `SERVICIO ${servicio.id} - ${servicio.nombre}: Sin artículos disponibles en los últimos 30 días.`;
      }
      const lista = articulos.map((a, i) =>
        `  [${i + 1}] Fuente: ${a.source.name} | Título: ${a.title} | URL: ${a.url} | Fecha: ${a.publishedAt?.slice(0, 10)}`
      ).join('\n');
      const nota = tieneLaMancha ? '⭐ Hay artículos de La Mancha' : '(sin resultados de La Mancha, usar mejor nacional)';
      return `SERVICIO ${servicio.id} - ${servicio.nombre} ${nota}:\n${lista}`;
    }).join('\n\n');

    // ── PASO 3: Claude elige y reformatea ────────────────────────────────────
    const prompt = `Hoy es ${fechaEs}. Eres editor de noticias para PYMEs de La Mancha (vino, aceite, manufactura, agroalimentario, turismo rural, servicios locales).

Aquí tienes artículos reales de medios españoles (últimos 30 días). Para cada uno de los 6 servicios, elige el artículo MÁS RELEVANTE y conviértelo en una noticia útil para el empresario manchego.

REGLAS CRÍTICAS:
- Usa SOLO la información de los artículos proporcionados. No inventes ni añadas datos.
- El campo "url" debe ser EXACTAMENTE la URL del artículo elegido, sin modificarla.
- El campo "fuente" debe ser EXACTAMENTE el nombre de la fuente del artículo elegido.
- El campo "fechaArticulo" debe ser EXACTAMENTE la fecha del artículo elegido (formato YYYY-MM-DD), sin modificarla.
- Si hay artículos de La Mancha (marcados con ⭐), priorízalos.
- Si no hay artículos disponibles para un servicio, pon url vacío, fuente vacío y fechaArticulo vacío.

ARTÍCULOS DISPONIBLES:
${resumenArticulos}

RESPONDE SOLO con array JSON sin markdown:
[{"id":1,"servicio":"nombre exacto","icono":"emoji","titular":"titular periodístico max 85 chars","resumen":"2 frases: qué dice el artículo y por qué importa a una PYME manchega.","fuente":"nombre exacto de la fuente","url":"URL exacta","fechaArticulo":"YYYY-MM-DD fecha exacta del artículo","cta":"pregunta directa al empresario"}]`;

    const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const claudeData = await claudeResp.json();
    if (claudeData.error) throw new Error('Claude error: ' + claudeData.error.message);

    const text = (claudeData.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Claude no devolvió JSON válido. Raw: ' + text.slice(0, 300));

    const news = JSON.parse(match[0]);

    // Enriquecer con fecha formateada e isToday desde la fecha real del artículo
    const cleanNews = news.map(n => {
      const urlOk = (n.url && typeof n.url === 'string' && n.url.startsWith('http')) ? n.url : '';
      const fechaArt = n.fechaArticulo || '';
      return {
        ...n,
        url: urlOk,
        fecha: fechaArt ? formatFecha(fechaArt) : '',
        isToday: isToday(fechaArt),
        fechaArticulo: fechaArt,
      };
    });

    // Guardar en Netlify Blobs
    const store = getStore({ name: 'levanta-news', consistency: 'strong' });
    await store.set(today, JSON.stringify({ news: cleanNews, date: today, generated: new Date().toISOString() }));

    return new Response(JSON.stringify({
      ok: true,
      date: today,
      count: cleanNews.length,
      manchaHits: articulosPorServicio.filter(a => a.tieneLaMancha).length,
      todayHits: cleanNews.filter(n => n.isToday).length,
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};
