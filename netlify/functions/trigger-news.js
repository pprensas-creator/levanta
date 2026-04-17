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

    // Prompt corto para no exceder el rate limit de 30k tokens/min
    const prompt = `Hoy es ${fechaEs}. Busca con web_search 6 noticias recientes (esta semana) de medios españoles para PYMEs de La Mancha (vino, aceite, manufactura, agroalimentario, turismo, servicios). Noticias que generen urgencia: "esto me afecta".

Una por servicio: 1.Eficiencia Operativa y Finanzas 2.Información y Datos 3.Experiencia del Cliente 4.Digitalización e IT 5.Talento y Liderazgo 6.Imagen de Marca.

Responde SOLO con JSON sin markdown:
[{"id":1,"servicio":"...","icono":"emoji","titular":"max 85 chars","resumen":"2 frases.","fuente":"medio","url":"URL exacta de web_search o cadena vacía si no verificada","fecha":"${fechaCorta}","cta":"pregunta directa"}]
CRÍTICO: url solo puede ser una URL que web_search haya devuelto, nunca inventada.`;

    // Llamada con web_search
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
        max_tokens: 1500,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await resp.json();

    // Si hay rate limit u otro error, fallback sin web_search
    if (data.error) {
      console.error('web_search call failed:', data.error.message);
      return await generateWithoutSearch(today, fechaEs, fechaCorta);
    }

    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    const match = text.match(/\[[\s\S]*\]/);
    if (!match) {
      console.error('No JSON found, falling back. Raw:', text.slice(0, 300));
      return await generateWithoutSearch(today, fechaEs, fechaCorta);
    }

    const news = JSON.parse(match[0]);

    // Limpiar URLs: eliminar cualquier URL que no empiece por http (inventadas)
    const cleanNews = news.map(n => ({
      ...n,
      url: (n.url && typeof n.url === 'string' && n.url.startsWith('http')) ? n.url : ''
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

// Fallback sin web_search: urls vacías pero noticias generadas
async function generateWithoutSearch(today, fechaEs, fechaCorta) {
  try {
    const prompt = `Hoy es ${fechaEs}. Genera 6 noticias económicas relevantes para PYMEs de La Mancha. Una por servicio: 1.Eficiencia Operativa y Finanzas 2.Información y Datos 3.Experiencia del Cliente 4.Digitalización e IT 5.Talento y Liderazgo 6.Imagen de Marca. RESPONDE SOLO con array JSON sin markdown: [{"id":1,"servicio":"nombre","icono":"emoji","titular":"max 85 chars","resumen":"2 frases impactantes.","fuente":"medio español real","url":"","fecha":"${fechaCorta}","cta":"pregunta directa al empresario"}]`;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
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

    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);

    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON en fallback');

    const news = JSON.parse(match[0]);
    // Sin web_search → todas las URLs vacías para no mostrar links inventados
    const cleanNews = news.map(n => ({ ...n, url: '' }));

    const store = getStore({ name: 'levanta-news', consistency: 'strong' });
    await store.set(today, JSON.stringify({ news: cleanNews, date: today, generated: new Date().toISOString(), fallback: true }));

    return new Response(JSON.stringify({ ok: true, date: today, count: cleanNews.length, warning: 'fallback sin web_search' }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
