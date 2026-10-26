import { getStore } from "@netlify/blobs";
import { generateNews } from "../lib/news.js";

// Función PROGRAMADA: genera las noticias cada día a las 05:00 UTC (06:00-07:00 en Madrid).
// Si ya hay noticias de hoy, no hace nada (así no gasta NewsAPI ni crédito de Anthropic).
export default async () => {
  const today = new Date().toISOString().split('T')[0];
  const store = getStore({ name: 'levanta-news', consistency: 'strong' });
  if (await store.get(today)) {
    console.log('daily-news: ya existen noticias de', today);
    return;
  }
  try {
    const result = await generateNews();
    console.log('daily-news: ok', JSON.stringify(result));
  } catch (e) {
    console.error('daily-news: fallo', e && e.message);
  }
};

export const config = { schedule: '0 5 * * *' };
