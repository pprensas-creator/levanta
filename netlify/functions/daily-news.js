import { getStore } from "@netlify/blobs";

export default async () => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const fechaEs = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const prompt = `Hoy es ${fechaEs}. Eres un experto en PYMEs españolas. Busca 6 noticias MUY RECIENTES (esta semana) de medios españoles reales.\n\nEl lector es el dueño de una PYME de 5-50 empleados en La Mancha. Elige noticias que generen urgencia o curiosidad. Una por cada servicio:\n1. Eficiencia Operativa y Finanzas\n2. Información y Datos\n3. Experiencia del Cliente\n4. Digitalización e IT\n5. Talento y Liderazgo\n6. Imagen de Marca y Presencia Online\n\nRESPONDE SOLO con array JSON, sin markdown:\n[{"id":1,"servicio":"nombre","icono":"emoji","titular":"max 85 chars","resumen":"2 frases.","fuente":"medio","fecha":"16 abr 2026","cta":"pregunta directa"}]`;

    const newsResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2500,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const newsData = await newsResp.json();
    const text = (newsData.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) { console.error('No news JSON'); return; }
    const news = JSON.parse(match[0]);
    if (!Array.isArray(news) || news.length < 6) { console.error('Bad news'); return; }

    const store = getStore({ name: 'levanta-news', consistency: 'strong' });
    await store.set(today, JSON.stringify({ news, date: today, generated: new Date().toISOString() }));
    console.log('News saved for', today);

    // Enviar a suscriptores
    const subStore = getStore({ name: 'levanta-subs', consistency: 'strong' });
    let subs = [];
    try { const raw = await subStore.get('list'); if (raw) subs = JSON.parse(raw); } catch(e) {}
    if (!subs.length) return;

    const KEY = process.env.RESEND_API_KEY;
    const FROM = 'Pablo Prensa · LEVANTA <noticias@levanta-lamancha.es>';
    const dateLabel = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    const dateShort = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });

    for (const sub of subs) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: FROM, to: sub.email, subject: `📰 LEVANTA IA News · ${dateShort}`, html: `<p>Hola ${sub.name}, aquí tus noticias de hoy. <a href="https://levanta-lamancha.es/#ainews">Ver en la web</a></p>` })
        });
        await new Promise(r => setTimeout(r, 150));
      } catch(e) { console.error('Send error:', sub.email, e); }
    }
    console.log('Sent to', subs.length, 'subscribers');
  } catch(e) { console.error('Error:', e); }
};

export const config = { schedule: "0 6 * * *" };
