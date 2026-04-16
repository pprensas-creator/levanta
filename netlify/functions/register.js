import { getStore } from "@netlify/blobs";

export default async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const { name, email, company = '', sector = '' } = await req.json();
    if (!name || !email) return new Response(JSON.stringify({ error: 'Nombre y email obligatorios' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });

    // Guardar suscriptor en Netlify Blobs
    const store = getStore('levanta-subs');
    let subs = [];
    try { const raw = await store.get('list'); if (raw) subs = JSON.parse(raw); } catch(e) {}
    if (subs.find(s => s.email === email)) {
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', ...cors } });
    }
    subs.push({ name, email, company, sector, date: new Date().toISOString() });
    await store.set('list', JSON.stringify(subs));

    // Generar CSV
    const csvRows = [
      ['Nombre', 'Empresa', 'Email', 'Sector', 'Fecha'],
      ...subs.map(s => [s.name, s.company, s.email, s.sector, new Date(s.date).toLocaleDateString('es-ES')])
    ];
    const csv = '\uFEFF' + csvRows.map(r => r.map(c => `"${(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const csvB64 = Buffer.from(csv).toString('base64');

    const KEY = process.env.RESEND_API_KEY;
    const FROM = 'Pablo Prensa · LEVANTA <noticias@levanta-lamancha.es>';

    // Email de bienvenida al suscriptor
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: email,
        subject: '✅ Ya recibirás las noticias de LEVANTA cada mañana',
        html: welcomeHtml(name)
      })
    });

    // Notificación a Pablo con Excel adjunto
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: 'levantalamancha@levanta.email',
        subject: `🆕 Nuevo suscriptor IA News: ${name}${company ? ' · ' + company : ''}`,
        html: `<p style="font-family:Arial,sans-serif;font-size:15px">
          <strong>Nuevo suscriptor registrado:</strong><br/>
          Nombre: <strong>${name}</strong><br/>
          Empresa: ${company || '—'}<br/>
          Email: ${email}<br/>
          Sector: ${sector || '—'}<br/><br/>
          Total suscriptores: <strong>${subs.length}</strong><br/><br/>
          Adjunto el listado completo actualizado en Excel.
        </p>`,
        attachments: [{
          filename: `suscriptores_levanta_${new Date().toISOString().split('T')[0]}.csv`,
          content: csvB64
        }]
      })
    });

    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', ...cors } });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
  }
};

function welcomeHtml(name) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',Arial,sans-serif">
<div style="max-width:600px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
  <div style="background:linear-gradient(135deg,#1a4f82 0%,#0d3360 60%,#2a4a10 100%);padding:36px 28px;text-align:center">
    <div style="font-size:30px;font-weight:800;letter-spacing:4px;color:#fff;margin-bottom:4px">LEVANTA</div>
    <div style="font-size:12px;color:rgba(255,255,255,.7);letter-spacing:1px">Consultoría · La Mancha</div>
    <div style="margin-top:16px;font-size:13px;color:rgba(255,255,255,.85);background:rgba(255,255,255,.1);border-radius:20px;display:inline-block;padding:5px 16px">📰 IA News · Newsletter diario</div>
  </div>
  <div style="padding:36px 28px">
    <h1 style="font-size:22px;color:#1a4f82;margin:0 0 14px;line-height:1.3">Hola ${name}, ¡ya formas parte de LEVANTA IA News!</h1>
    <p style="color:#4b5563;font-size:15px;line-height:1.75;margin:0 0 16px">
      A partir de <strong>mañana a las 7h</strong> recibirás cada día las <strong>6 noticias más relevantes para tu empresa</strong>, seleccionadas por inteligencia artificial entre cientos de fuentes españolas.
    </p>
    <p style="color:#4b5563;font-size:15px;line-height:1.75;margin:0 0 24px">
      Cada noticia viene con una pregunta directa para que reflexiones sobre tu empresa — y si quieres actuar, estoy a un clic.
    </p>
    <div style="text-align:center;margin-bottom:28px">
      <a href="https://calendly.com/pprensas" style="display:inline-block;background:#4a6e1a;color:#fff;padding:15px 30px;border-radius:9px;font-size:15px;font-weight:700;text-decoration:none;letter-spacing:.3px">
        📅 Agenda tu diagnóstico gratuito — 30 min, sin coste
      </a>
    </div>
    <div style="background:#f8f6f0;border:1px solid #e2e8d8;border-radius:12px;padding:18px;display:flex;gap:14px;align-items:center">
      <img src="https://i.postimg.cc/Vv1sNDff/Chat-GPT-Image-Jan-15-2026-05-48-06-PM.jpg" style="width:60px;height:60px;border-radius:50%;object-fit:cover;border:3px solid #4a6e1a;flex-shrink:0"/>
      <div>
        <div style="font-weight:700;color:#1a4f82;font-size:14px">Pablo Prensa · Fundador LEVANTA</div>
        <div style="font-size:12.5px;color:#6b7280;margin-top:3px;line-height:1.6">
          Senior Director Internacional · CHEP · Pegasus Solutions · +20 años<br/>
          📞 <a href="tel:+34659681684" style="color:#1a4f82;text-decoration:none">+34 659 681 684</a> &nbsp;·&nbsp;
          <a href="mailto:levantalamancha@levanta.email" style="color:#1a4f82;text-decoration:none">levantalamancha@levanta.email</a>
        </div>
      </div>
    </div>
  </div>
  <div style="background:#0d1f35;padding:18px 28px;text-align:center">
    <p style="color:rgba(255,255,255,.4);font-size:11px;margin:0;line-height:1.7">
      LEVANTA · Consultoría de Desarrollo Local · La Mancha<br/>
      Para darte de baja, responde a este email con el asunto "Baja".
    </p>
  </div>
</div>
</body></html>`;
}
