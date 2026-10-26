import { getStore } from "@netlify/blobs";
import { cleanSource } from "../lib/news.js";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default async () => {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  try {
    const store = getStore({ name: 'levanta-news', consistency: 'strong' });
    const raw = await store.get('current');
    if (!raw) {
      return new Response(JSON.stringify({ news: null }), { headers: { ...headers, 'Cache-Control': 'no-cache' } });
    }
    const data = JSON.parse(raw);
    const now = Date.now();
    // Una noticia es "NEW" si se añadió en los últimos 7 días
    const news = (data.news || [])
      .filter(n => n && n.url && /^https?:\/\//.test(n.url))
      .map(n => ({ ...n, fuente: cleanSource(n.fuente), isNew: !!n.addedAt && now - new Date(n.addedAt).getTime() < WEEK_MS }));
    return new Response(JSON.stringify({ news, updated: data.updated }), { headers });
  } catch (e) {
    console.error('get-news:', e && e.message);
    return new Response(JSON.stringify({ error: 'No se pudieron cargar las noticias' }), { status: 500, headers: { ...headers, 'Cache-Control': 'no-cache' } });
  }
};
