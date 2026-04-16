export default async () => {
  try {
    const resp = await fetch('https://levanta-lamancha.es/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2500,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: 'Genera 6 noticias de hoy para PYMEs de La Mancha. Una por servicio: 1.Eficiencia Operativa 2.Información y Datos 3.Experiencia del Cliente 4.Digitalización e IT 5.Talento y Liderazgo 6.Imagen de Marca. SOLO array JSON sin markdown: [{"id":1,"servicio":"nombre","icono":"emoji","titular":"max 85 chars","resumen":"2 frases","fuente":"medio","fecha":"16 abr 2026","cta":"pregunta directa"}]' }]
      })
    });
    const d = await resp.json();
    const text = (d.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) { console.error('No news JSON'); return; }
    const news = JSON.parse(match[0]);
    const { getStore } = await import('@netlify/blobs');
    const store = getStore({ name: 'levanta-news', consistency: 'strong' });
    const today = new Date().toISOString().split('T')[0];
    await store.set(today, JSON.stringify({ news, date: today }));
    console.log('News saved:', today, news.length, 'items');
  } catch(e) { console.error('Error:', e.message); }
};

export const config = { schedule: "0 6 * * *" };
