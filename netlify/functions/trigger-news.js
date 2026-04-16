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

    const prompt = `Hoy es ${fechaEs}. Genera 6 noticias económicas relevantes para PYMEs de La Mancha. Una por servicio: 1.Eficiencia Operativa y Finanzas 2.Información y Datos 3.Experiencia del Cliente 4.Digitalización e IT 5.Talento y Liderazgo 6.Imagen de Marca. RESPONDE SOLO con array JSON sin markdown: [{"id":1,"servicio":"nombre","icono":"emoji","titular":"max 85 chars","resumen":"2 frases impactantes.","fuente":"medio español real","url":"https://url-real-del-articulo.com","fecha":"${fechaCorta}","cta":"pregunta directa al empresario"}]`;

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
    if (data.error) return new Response(JSON.stringify({ error: data.error }), { status: 500, headers: { 'Content-Type': 'application/json' } });

    const text = (data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return new Response(JSON.stringify({ error: 'No JSON', raw: text.slice(0,500) }), { status: 500, headers: { 'Content-Type': 'application/json' } });

    const news = JSON.parse(match[0]);
    const store = getStore({ name: 'levanta-news', consistency: 'strong' });
    await store.set(today, JSON.stringify({ news, date: today, generated: new Date().toISOString() }));

    return new Response(JSON.stringify({ ok: true, date: today, count: news.length }), { headers: { 'Content-Type': 'application/json' } });
  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
