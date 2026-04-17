import { getStore } from "@netlify/blobs";

// ── CONFIGURACIÓN DE SERVICIOS ────────────────────────────────────────────────
const SERVICIOS = [
  {
    id: 1,
    nombre: 'Eficiencia Operativa y Finanzas',
    icono: '⚙️',
    keywords: 'pyme costes energía inflación márgenes automatización finanzas',
  },
  {
    id: 2,
    nombre: 'Información y Datos',
    icono: '📊',
    keywords: 'pyme digitalización datos inteligencia negocio cuadro mando BI',
  },
  {
    id: 3,
    nombre: 'Experiencia del Cliente',
    icono: '⭐',
    keywords: 'consumidor empresa fidelización atención cliente tendencias',
  },
  {
    id: 4,
    nombre: 'Digitalización e IT',
    icono: '💻',
    keywords: 'pyme ciberseguridad ERP CRM inteligencia artificial tecnología',
  },
  {
    id: 5,
    nombre: 'Talento y Liderazgo',
    icono: '🤝',
    keywords: 'empleo empresa salarios convenio talento retención trabajadores',
  },
  {
    id: 6,
    nombre: 'Imagen de Marca y Presencia Online',
    icono: '🎯',
    keywords: 'pyme marketing digital redes sociales SEO Google reputación marca',
  },
];

// ── FUNCIÓN: BUSCAR EN NEWSAPI ────────────────────────────────────────────────
async function buscarNoticias(query, apiKey, pageSize = 5) {
  const params = new URLSearchParams({
    q: query,
    language: 'es',
    sortBy: 'publishedAt',
    pageSize: String(pageSize),
    apiKey,
  });
  const resp = await fetch(`https://newsapi.org/v2/everything?${params}`);
  const data = await resp.json();
  if (data.status !== 'ok') return [];
  // Filtrar artículos sin contenido útil
  return (data.articles || []).filter(a =>
    a.title && a.url && !a.title.includes('[Removed]') && a.source?.name
  );
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
    const fechaCorta = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

    // ── PASO 1: Recopilar artículos reales por servicio ──────────────────────
    const articulosPorServicio = [];

    for (const svc of SERVICIOS) {
      // Búsqueda 1: La Mancha + keywords del servicio (prioridad)
      const manchaQuery = `("castilla la mancha" OR "la mancha") (${svc.keywords})`;
      const manchaResults = await buscarNoticias(manchaQuery, NEWS_API_KEY, 3);

      // Búsqueda 2: España nacional para este servicio (fallback)
      const nacionalQuery = `(pyme OR empresa OR empresas) (${svc.keywords}) españa`;
      const nacionalResults = await buscarNoticias(nacionalQuery, NEWS_API_KEY, 5);

      // Combinar: La Mancha primero, luego nacional
      const combinados = [...manchaResults, ...nacionalResults].slice(0, 5);

      articulosPorServicio.push({
        servicio: svc,
        articulos: combinados,
        tieneLaMancha: manchaResults.length > 0,
      });
    }

    // ── PASO 2: Formatear artículos para el prompt de Claude ─────────────────
    const resumenArticulos = articulosPorServicio.map(({ servicio, articulos, tieneLaMancha }) => {
      if (!articulos.length) {
        return `SERVICIO ${servicio.id} - ${servicio.nombre}: Sin artículos disponibles.`;
      }
      const lista = articulos.map((a, i) =>
        `  [${i + 1}] Fuente: ${a.source.name} | Título: ${a.title} | URL: ${a.url} | Fecha: ${a.publishedAt?.slice(0,10)}`
      ).join('\n');
      const nota = tieneLaMancha ? '⭐ Hay artículos de La Mancha' : '(sin resultados de La Mancha, usar mejor nacional)';
      return `SERVICIO ${servicio.id} - ${servicio.nombre} ${nota}:\n${lista}`;
    }).join('\n\n');

    // ── PASO 3: Claude reformatea (no inventa) ────────────────────────────────
    const prompt = `Hoy es ${fechaEs}. Eres editor de noticias para PYMEs de La Mancha (vino, aceite, manufactura, agroalimentario, turismo rural, servicios locales).

Aquí tienes artículos reales recuperados ahora mismo de medios españoles. Para cada uno de los 6 servicios, elige el artículo MÁS RELEVANTE y conviértelo en una noticia útil para el empresario de La Mancha.

REGLAS CRÍTICAS:
- Usa SOLO la información de los artículos proporcionados. No inventes ni añadas datos.
- El campo "url" debe ser EXACTAMENTE la URL del artículo elegido, sin modificarla.
- El campo "fuente" debe ser EXACTAMENTE el nombre de la fuente del artículo elegido.
- Si hay artículos de La Mancha (marcados con ⭐), priorízalos.
- Si no hay artículos para un servicio, escribe titular y resumen genéricos informativos y deja url vacío.

ARTÍCULOS DISPONIBLES:
${resumenArticulos}

RESPONDE SOLO con array JSON sin markdown:
[{"id":1,"servicio":"nombre exacto del servicio","icono":"emoji","titular":"titular periodístico urgente max 85 chars basado en el artículo real","resumen":"2 frases: qué dice el artículo y por qué importa a una PYME manchega.","fuente":"nombre exacto de la fuente","url":"URL exacta del artículo elegido","fecha":"${fechaCorta}","cta":"pregunta directa y personal al empresario"}]`;

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

    // Validación final: solo URLs que vengan de NewsAPI (empiezan por http)
    const cleanNews = news.map(n => ({
      ...n,
      url: (n.url && typeof n.url === 'string' && n.url.startsWith('http')) ? n.url : ''
    }));

    // Guardar en Netlify Blobs
    const store = getStore({ name: 'levanta-news', consistency: 'strong' });
    await store.set(today, JSON.stringify({ news: cleanNews, date: today, generated: new Date().toISOString() }));

    return new Response(JSON.stringify({
      ok: true,
      date: today,
      count: cleanNews.length,
      manchaHits: articulosPorServicio.filter(a => a.tieneLaMancha).length,
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};
