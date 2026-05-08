import { getStore } from "@netlify/blobs";

const TOPICS = [
  { id: 1, service: "Eficiencia Operativa y Finanzas", icon: "⚙️", query: "PYME eficiencia operativa finanzas España" },
  { id: 2, service: "Información y Datos", icon: "📊", query: "analytics datos business intelligence PYME España" },
  { id: 3, service: "Experiencia del Cliente", icon: "⭐", query: "customer experience CX PYME España" },
  { id: 4, service: "Digitalización e IT", icon: "💻", query: "digitalización transformación digital PYME España" },
  { id: 5, service: "Talento y Liderazgo", icon: "🤝", query: "talento liderazgo RRHH PYME España" },
  { id: 6, service: "Imagen de Marca y Presencia Online", icon: "🎯", query: "marca online marketing digital PYME España" }
];

export default async () => {
  try {
    const store = getStore({ name: 'levanta-news', consistency: 'strong' });
    const history = await store.get('history') || '{}';
    const newsDb = JSON.parse(history);
    const today = new Date().toISOString().split('T')[0];
    
    for (const topic of TOPICS) {
      const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(topic.query)}&language=es&sortBy=publishedAt&pageSize=5&apiKey=${process.env.NEWS_API_KEY}`;
      const resp = await fetch(url);
      const data = await resp.json();
      
      if (data.articles && data.articles.length > 0) {
        const article = data.articles[0];
        newsDb[topic.id] = {
          id: topic.id,
          servicio: topic.service,
          icono: topic.icon,
          titular: article.title.substring(0, 85),
          resumen: article.description || article.content?.substring(0, 150) || "",
          fuente: article.source.name,
          url: article.url,
          fecha: new Date(article.publishedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }),
          cta: `Leer en ${article.source.name}`
        };
      }
    }
    
    await store.set('history', JSON.stringify(newsDb));
    const newsArray = Object.values(newsDb).filter(n => n.id).sort((a, b) => a.id - b.id);
    await store.set(today, JSON.stringify({ news: newsArray, date: today }));
    
    console.log('Weekly news updated:', newsArray.length, 'items');
  } catch (e) {
    console.error('Error:', e.message);
  }
};

export const config = { schedule: "0 7 * * 1" };
