import { generateNews } from "../lib/news.js";

// Renovación SEMANAL de las noticias: lunes 05:00 UTC (06:00-07:00 en Madrid),
// antes de la newsletter (07:00 UTC). Si no hay nada nuevo, se mantienen las existentes.
export default async () => {
  try {
    const result = await generateNews();
    console.log('weekly-news:', JSON.stringify(result));
  } catch (e) {
    console.error('weekly-news: fallo', e && e.message);
  }
};

export const config = { schedule: '0 5 * * 1' };
