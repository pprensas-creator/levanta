import { generateNews } from "../lib/news.js";

// Disparo MANUAL (marcador del navegador): /.netlify/functions/trigger-news?key=TU_CLAVE
// Genera y guarda las noticias de hoy aunque ya existan.
export default async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get('key') !== process.env.TRIGGER_KEY) {
    return new Response('Unauthorized', { status: 401 });
  }
  try {
    const result = await generateNews();
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('trigger-news:', e && e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
};
