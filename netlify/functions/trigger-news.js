import { getStore } from "@netlify/blobs";

export default async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get('key') !== process.env.TRIGGER_KEY) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    const fechaEs = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const fechaCorta = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

    const prompt = `Hoy es ${fechaEs}. USA web_search para buscar 6 noticias MUY RECIENTES (esta semana) de medios españoles reales relevantes para PYMEs de La Mancha.

El lector es el dueño de una PYME de 5-50 empleados en La Mancha (Castilla-La Mancha): vino, aceite, manufactura, agroalimentario, turismo rural o servicios locales.

Criterio: noticias que generen urgencia o preocupación. Que piense "esto me afecta a mí".

Una noticia por cada uno de estos 6 servicios:
1. Eficiencia Operativa y Finanzas (costes energéticos, inflación, márgenes PYME, automatización)
2. Información y Datos (digitalización PYME, cuadros de mando, BI)
3. Experiencia del Cliente (tendencias consumidor español, fidelización)
4. Digitalización e IT (ciberseguridad PYME, ERP/CRM, IA aplicada)
5. Talento y Liderazgo (mercado laboral, retención talento, salarios, convenios)
6. Imagen de Marca y Presencia Online (SEO, redes sociales PYME, Google)

RESPONDE ÚNICAMENTE con un array JSON válido, sin markdown ni explicaciones, con exactamente 6 objetos:
[{"id":1,"servicio":"nombre exacto del servicio","icono":"emoji","titular":"titular impactante max 85 caracteres","resumen":"2 frases: qué pasa y por qué le importa a una PYME manchega.","fuente":"nombre del medio","url":"URL EXACTA devuelta por web_search. PROHIBIDO inventar o construir URLs. Si no tienes la URL verificada, pon cadena vacía.","fecha":"${fechaCorta}","cta":"pregunta directa al empresario"}]

CRÍTICO: El campo url SOLO puede contener URLs que web_search haya devuelto explícitamente. Nunca construyas ni deduzcas una URL a partir del nombre del medio o del titular.`;

    // Primera llamada: con web_search para obtener URLs reales
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await resp.json();

    if (data.error) {
      // Fallback sin web_search si falla
      return await generateWithoutSearch(today, prompt);
    }

    // Extraer solo los bloques de texto (ignorar tool_use y tool_result)
    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    const match = text.match(/\[[\s\S]*\]/);
    if (!match) {
      return new Response(JSON.stringify({ error: 'No JSON en respuesta', raw: text.slice(0, 500) }), {
        status: 500, headers: { 'Content-Type': 'application/json' }
      });
    }

    const news = JSON.parse(match[0]);

    // Validar y limpiar URLs: eliminar cualquier URL que no empiece por http
    const cleanNews = news.map(n => ({
      ...n,
      url: (n.url && n.url.startsWith('http')) ? n.url : ''
    }));

    const store = getStore({ name: 'levanta-news', consistency: 'strong' });
    await store.set(today, JSON.stringify({ news: cleanNews, date: today, generated: new Date().toISOString() }));

    return new Response(JSON.stringify({ ok: true, date: today, count: cleanNews.length }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Fallback: genera sin web_search (sin URLs verificadas)
async function generateWithoutSearch(today, prompt) {
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON');
    const news = JSON.parse(match[0]);
    // Sin web_search, no hay URLs verificadas → vaciar todas
    const cleanNews = news.map(n => ({ ...n, url: '' }));
    const store = getStore({ name: 'levanta-news', consistency: 'strong' });
    await store.set(today, JSON.stringify({ news: cleanNews, date: today, generated: new Date().toISOString() }));
    return new Response(JSON.stringify({ ok: true, date: today, count: cleanNews.length, warning: 'sin web_search' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
