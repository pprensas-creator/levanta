import { getStore } from "@netlify/blobs";

export default async () => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const fechaEs = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

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
        messages: [{ role: 'user', content: `Hoy es ${fechaEs}. Genera 6 noticias económicas y empresariales MUY RECIENTES y relevantes para el dueño de una PYME de La Mancha (sectores: vino, aceite, manufactura, agroalimentario, turismo, servicios). Que generen urgencia o reflexión. Una por servicio:\n1. Eficiencia Operativa y Finanzas\n2. Información y Datos\n3. Experiencia del Cliente\n4. Digitalización e IT\n5. Talento y Liderazgo\n6. Imagen de Marca y Presencia Online\n\nRESPONDE SOLO con array JSON sin markdown:\n[{"id":1,"servicio":"nombre","icono":"emoji","titular":"max 85 chars","resumen":"2 frases impactantes.","fuente":"medio español real","fecha":"${new Date().toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'})}","cta":"pregunta directa al empresario"}]` }]
      })
    });

    const data = await resp.json();
    const text = (data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) { console.error('No JSON'); return; }
    const news = JSON.parse(match[0]);
    if (!Array.isArray(news)||news.length<6) { console.error('Bad data'); return; }

    const store = getStore({ name: 'levanta-news', consistency: 'strong' });
    await store.set(today, JSON.stringify({ news, date: today, generated: new Date().toISOString() }));
    console.log('News saved for', today, '-', news.length, 'items');

  } catch(e) { console.error('Error:', e.message); }
};

export const config = { schedule: "0 6 * * *" };
