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
      return new Response(cached, {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...cors }
      });
    }

    // Si no hay noticias del día todavía, devuelve null
    return new Response(JSON.stringify({ news: null, date: today }), {
      headers: { 'Content-Type': 'application/json', ...cors }
    });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...cors }
    });
  }
};
