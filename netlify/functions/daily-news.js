import { getStore } from "@netlify/blobs";

export default async () => {
  try {
    // Obtener suscriptores
    const store = getStore('levanta-subs');
    let subs = [];
    try { const raw = await store.get('list'); if (raw) subs = JSON.parse(raw); } catch(e) {}
    if (!subs.length) { console.log('No subscribers yet.'); return; }

    // Generar noticias del día con Claude + web search
    const fechaEs = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const prompt = `Hoy es ${fechaEs}. Eres un experto en PYMEs españolas. Busca 6 noticias MUY RECIENTES (esta semana) de medios españoles reales.

El lector es el dueño de una PYME de 5-50 empleados en La Mancha (Castilla-La Mancha): sectores como vino, aceite, manufactura, agroalimentario, turismo rural o servicios locales.

Criterio de selección: elige noticias que generen urgencia, preocupación o curiosidad en ese empresario. Que piense "esto me afecta a mí".

Una noticia por cada uno de estos 6 servicios:
1. Eficiencia Operativa y Finanzas
2. Información y Datos
3. Experiencia del Cliente
4. Digitalización e IT
5. Talento y Liderazgo
6. Imagen de Marca y Presencia Online

RESPONDE ÚNICAMENTE con un array JSON válido, sin markdown, con exactamente 6 objetos:
[{"id":1,"servicio":"nombre","icono":"emoji","titular":"titular impactante max 85 chars","resumen":"2 frases: qué pasa y por qué importa a una PYME manchega.","fuente":"nombre del medio","fecha":"ej: 16 abr 2026","cta":"pregunta directa para reflexionar sobre su empresa"}]`;

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
    if (!match) { console.error('No news JSON found'); return; }
    const news = JSON.parse(match[0]);
    if (!Array.isArray(news) || news.length < 6) { console.error('Bad news array'); return; }

    const KEY = process.env.RESEND_API_KEY;
    const FROM = 'Pablo Prensa · LEVANTA <noticias@levanta-lamancha.es>';
    const dateLabel = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    const dateShort = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });

    // Enviar email a cada suscriptor
    for (const sub of subs) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: FROM,
            to: sub.email,
            subject: `📰 LEVANTA IA News · ${dateShort} · Las noticias de hoy para tu empresa`,
            html: dailyEmailHtml(sub.name, news, dateLabel)
          })
        });
        await new Promise(r => setTimeout(r, 150)); // evitar rate limit
      } catch(e) { console.error(`Error sending to ${sub.email}:`, e); }
    }

    console.log(`Daily news sent to ${subs.length} subscribers.`);
  } catch(e) {
    console.error('Daily news error:', e);
  }
};

export const config = {
  schedule: "0 7 * * *"  // Cada día a las 7:00 AM UTC (9:00 AM España en verano)
};

function dailyEmailHtml(name, news, dateLabel) {
  const cards = news.map(n => `
    <div style="background:#f8f9ff;border:1px solid #e2e8d8;border-radius:12px;padding:18px;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-size:1.2rem">${n.icono}</span>
        <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#4a6e1a">${n.servicio}</span>
        <span style="margin-left:auto;font-size:10px;color:#9ca3af;background:#f3f4f6;padding:2px 7px;border-radius:8px">${n.fuente} · ${n.fecha}</span>
      </div>
      <div style="font-size:15px;font-weight:700;color:#1a4f82;line-height:1.35;margin-bottom:7px">${n.titular}</div>
      <div style="font-size:13.5px;color:#4b5563;line-height:1.65;margin-bottom:12px">${n.resumen}</div>
      <div style="background:linear-gradient(90deg,#1a4f82,#2d6faf);border-radius:8px;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span style="font-size:12.5px;font-weight:600;color:#fff;line-height:1.4">${n.cta}</span>
        <a href="https://calendly.com/pprensas" style="flex-shrink:0;background:#4a6e1a;color:#fff;padding:7px 14px;border-radius:6px;font-size:11.5px;font-weight:700;text-decoration:none;white-space:nowrap">Hablamos →</a>
      </div>
    </div>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif">
<div style="max-width:620px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1a4f82 0%,#0d3360 60%,#2a4a10 100%);padding:28px;display:flex;align-items:center;justify-content:space-between">
    <div>
      <div style="font-size:24px;font-weight:800;letter-spacing:3px;color:#fff">LEVANTA</div>
      <div style="font-size:11px;color:rgba(255,255,255,.65);margin-top:2px">Consultoría · La Mancha</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:11px;color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:1px">IA News</div>
      <div style="font-size:13px;font-weight:700;color:#fff;margin-top:2px;text-transform:capitalize">${dateLabel}</div>
    </div>
  </div>
  <!-- Intro -->
  <div style="padding:24px 28px 8px">
    <p style="color:#374151;font-size:14.5px;line-height:1.7;margin:0">
      Hola <strong>${name}</strong>, estas son las <strong>6 noticias de hoy</strong> que más pueden afectar a tu empresa. Seleccionadas por IA entre cientos de fuentes españolas.
    </p>
  </div>
  <!-- News cards -->
  <div style="padding:16px 28px">${cards}</div>
  <!-- CTA principal -->
  <div style="margin:0 28px 28px;background:linear-gradient(135deg,#4a6e1a,#2a4a10);border-radius:12px;padding:24px;text-align:center">
    <div style="font-size:1.4rem;margin-bottom:8px">☕</div>
    <h3 style="color:#fff;font-size:17px;font-weight:700;margin:0 0 8px;line-height:1.4">¿Alguna de estas noticias te preocupa?</h3>
    <p style="color:rgba(255,255,255,.8);font-size:13.5px;margin:0 0 16px;line-height:1.6">Hablamos 30 minutos — por videollamada o tomando un café en La Mancha. Te digo exactamente qué puedes hacer.</p>
    <a href="https://calendly.com/pprensas" style="display:inline-block;background:#fff;color:#4a6e1a;padding:13px 26px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none">
      📅 Agenda gratis con Pablo Prensa
    </a>
  </div>
  <!-- Footer -->
  <div style="background:#0d1f35;padding:18px 28px;text-align:center">
    <p style="color:rgba(255,255,255,.5);font-size:11px;margin:0 0 6px;line-height:1.7">
      LEVANTA · Consultoría de Desarrollo Local · La Mancha<br/>
      📞 +34 659 681 684 · levantalamancha@levanta.email
    </p>
    <p style="color:rgba(255,255,255,.3);font-size:10px;margin:0">Para darte de baja, responde a este email con el asunto "Baja".</p>
  </div>
</div>
</body></html>`;
}
