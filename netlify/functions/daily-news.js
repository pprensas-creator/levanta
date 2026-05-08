import { getStore } from "@netlify/blobs";

export default async () => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const fechaEs = new Date().toLocaleDateString('es-ES', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

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
        messages: [{
          role: 'user',
          content: `Hoy es ${fechaEs}. Genera 6 noticias económicas relevantes para PYMEs de La Mancha (vino, aceite, manufactura, agroalimentario, turismo, servicios). Una por servicio:
1. Eficiencia Operativa y Finanzas
2. Información y Datos
3. Experiencia del Cliente
4. Digitalización e IT
5. Talento y Liderazgo
6. Imagen de Marca y Presencia Online

Para cada noticia incluye "keywords": 3-4 palabras clave en español para buscar en Google News (ej: "ICO préstamos PYME 2025") y "fuente": medio español real (Expansión, El Economista, Cinco Días, La Tribuna de Toledo, Hosteltur, etc.)

RESPONDE SOLO con array JSON sin markdown:
[{"id":1,"servicio":"nombre","icono":"emoji","titular":"max 85 chars","resumen":"2 frases impactantes.","fuente":"medio español","keywords":"palabras clave","fecha":"${new Date().toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'})}","cta":"pregunta directa"}]`
        }]
      })
    });

    const data = await resp.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) { console.error('No JSON found'); return; }

    const news = JSON.parse(match[0]);
    if (!Array.isArray(news) || news.length < 6) { console.error('Bad data'); return; }

    const newsWithUrls = news.map(n => ({
      ...n,
      url: `https://news.google.com/search?q=${encodeURIComponent(n.keywords || n.titular)}&hl=es&gl=ES&ceid=ES:es`
    }));

    const store = getStore({ name: 'levanta-news', consistency: 'strong' });
    await store.set(today, JSON.stringify({
      news: newsWithUrls,
      date: today,
      generated: new Date().toISOString()
    }));

    console.log('News saved for', today, '-', newsWithUrls.length, 'items');
  } catch (e) {
    console.error('Error:', e.message);
  }
};

export const config = { schedule: "0 6 * * *" };
