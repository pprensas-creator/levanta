import { getStore } from "@netlify/blobs";
import { createHmac } from "crypto";

function generateUnsubToken(email) {
  return createHmac('sha256', process.env.TRIGGER_KEY || 'levanta2026')
    .update(email.toLowerCase().trim())
    .digest('hex');
}

export default async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const { name, email, company = '', sector = '' } = await req.json();
    if (!name || !email) return new Response(JSON.stringify({ error: 'Faltan datos' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });

    const emailClean = email.toLowerCase().trim();
    const KEY = process.env.RESEND_API_KEY;
    const FROM = 'Pablo Prensa · LEVANTA <noticias@levanta-lamancha.es>';
    const date = new Date().toLocaleDateString('es-ES');

    // Guardar suscriptor en Netlify Blobs
    const store = getStore({ name: 'levanta-subs', consistency: 'strong' });
    await store.set(emailClean, JSON.stringify({
      name, email: emailClean, company, sector,
      subscribed: new Date().toISOString()
    }));

    // Generar link de baja seguro
    const token = generateUnsubToken(emailClean);
    const unsubUrl = `https://levanta-lamancha.netlify.app/.netlify/functions/unsubscribe?email=${encodeURIComponent(emailClean)}&token=${token}`;

    // Email bienvenida al suscriptor
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: emailClean,
        subject: '✅ Ya recibirás las noticias de LEVANTA cada mañana',
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:linear-gradient(135deg,#1a4f82,#0d3360,#2a4a10);padding:32px;text-align:center;border-radius:12px 12px 0 0">
            <div style="font-size:28px;font-weight:800;letter-spacing:4px;color:#fff">LEVANTA</div>
            <div style="font-size:12px;color:rgba(255,255,255,.7)">Consultoría · La Mancha</div>
          </div>
          <div style="padding:32px;background:#fff;border:1px solid #e2e8d8">
            <h2 style="color:#1a4f82">Hola ${name}, ¡bienvenido a LEVANTA IA News!</h2>
            <p style="color:#4b5563;line-height:1.7">A partir de <strong>mañana a las 7h</strong> recibirás cada día las <strong>6 noticias más relevantes para tu empresa</strong>, seleccionadas por inteligencia artificial.</p>
            <p style="color:#4b5563;line-height:1.7">Cada noticia viene con una pregunta directa para reflexionar sobre tu negocio.</p>
            <div style="text-align:center;margin:28px 0">
              <a href="https://calendly.com/pprensas" style="background:#4a6e1a;color:#fff;padding:14px 28px;border-radius:8px;font-weight:700;text-decoration:none;font-size:15px">📅 Agenda tu diagnóstico gratuito</a>
            </div>
            <div style="background:#f8f6f0;border-radius:10px;padding:16px;display:flex;gap:12px;align-items:center">
              <img src="https://i.postimg.cc/Vv1sNDff/Chat-GPT-Image-Jan-15-2026-05-48-06-PM.jpg" style="width:55px;height:55px;border-radius:50%;object-fit:cover;border:3px solid #4a6e1a"/>
              <div>
                <div style="font-weight:700;color:#1a4f82">Pablo Prensa · Fundador LEVANTA</div>
                <div style="font-size:12px;color:#6b7280">📞 +34 659 681 684 · levantalamancha@levanta.email</div>
              </div>
            </div>
          </div>
          <div style="background:#0d1f35;padding:16px;text-align:center;border-radius:0 0 12px 12px">
            <p style="color:rgba(255,255,255,.4);font-size:11px;margin:0">
              ¿No quieres recibir más emails? 
              <a href="${unsubUrl}" style="color:rgba(255,255,255,.5);text-decoration:underline">Darte de baja aquí</a>
            </p>
          </div>
        </div>`
      })
    });

    // Notificación a Pablo
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: 'levantalamancha@levanta.email',
        subject: `🆕 Nuevo suscriptor IA News: ${name}${company ? ' · ' + company : ''}`,
        html: `<div style="font-family:Arial,sans-serif;padding:24px;max-width:500px">
          <h2 style="color:#1a4f82">Nuevo suscriptor registrado</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px;color:#6b7280;font-size:14px">Nombre</td><td style="padding:8px;font-weight:700">${name}</td></tr>
            <tr style="background:#f8f6f0"><td style="padding:8px;color:#6b7280;font-size:14px">Empresa</td><td style="padding:8px">${company||'—'}</td></tr>
            <tr><td style="padding:8px;color:#6b7280;font-size:14px">Email</td><td style="padding:8px"><a href="mailto:${emailClean}">${emailClean}</a></td></tr>
            <tr style="background:#f8f6f0"><td style="padding:8px;color:#6b7280;font-size:14px">Sector</td><td style="padding:8px">${sector||'—'}</td></tr>
            <tr><td style="padding:8px;color:#6b7280;font-size:14px">Fecha</td><td style="padding:8px">${date}</td></tr>
          </table>
        </div>`
      })
    });

    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', ...cors } });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
  }
};
