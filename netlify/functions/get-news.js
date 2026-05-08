import { getStore } from "@netlify/blobs";

export default async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  try {
    const store = getStore({ name: 'levanta-news', consistency: 'strong' });
    const today = new Date().toISOString().split('T')[0];
    const cached = await store.get(today);

    if (cached) {
      const data = JSON.parse(cached);

      // Añadir URL si la noticia no la tiene (compatibilidad con noticias antiguas)
      if (Array.isArray(data.news)) {
        data.news = data.news.map(n => ({
          ...n,
          url: n.url || `https://news.google.com/search?q=${encodeURIComponent(n.keywords || n.titular)}&hl=es&gl=ES&ceid=ES:es`
        }));
      }

      return new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600',
          ...cors
        }
      });
    }

    return new Response(JSON.stringify({ news: null, date: today }), {
      headers: { 'Content-Type': 'application/json', ...cors }
    });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...cors }
    });
  }
};
