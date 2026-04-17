import { getStore } from "@netlify/blobs";
import { createHmac } from "crypto";

function generateToken(email) {
  return createHmac('sha256', process.env.TRIGGER_KEY || 'levanta2026')
    .update(email.toLowerCase().trim())
    .digest('hex');
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const { email } = await req.json();
    if (!email) return new Response(JSON.stringify({ error: 'Email requerido' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } });

    const emailClean = email.toLowerCase().trim();

    // Verificar que el email existe en la lista
    const store = getStore({ name: 'levanta-subs', consistency: 'strong' });
    const existing = await store.get(emailClean);
    if (!existing) {
      // Responder OK igualmente para no revelar qué emails están suscritos
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', ...cors } });
    }

    // Generar link de baja seguro
    const token = generateToken(emailClean);
    const unsubUrl = `https://levanta-lamancha.netlify.app/.netlify/functions/unsubscribe?email=${encodeURIComponent(emailClean)}&token=${token}`;

    // Enviar email de confirmación
    const KEY = process.env.RESEND_API_KEY;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Pablo Prensa · LEVANTA <noticias@levanta-lamancha.es>',
        to: emailClean,
        subject: 'Confirma tu baja en LEVANTA IA News',
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:linear-gradient(135deg,#1a4f82,#0d3360,#2a4a10);padding:32px;text-align:center;border-radius:12px 12px 0 0">
            <div style="font-size:28px;font-weight:800;letter-spacing:4px;color:#fff">LEVANTA</div>
            <div style="font-size:12px;color:rgba(255,255,255,.7)">Consultoría · La Mancha</div>
          </div>
          <div style="padding:32px;background:#fff;border:1px solid #e2e8d8">
            <h2 style="color:#1a4f82">Solicitud de baja recibida</h2>
            <p style="color:#4b5563;line-height:1.7">Hemos recibido tu solicitud para darte de baja de <strong>LEVANTA IA News</strong>.</p>
            <p style="color:#4b5563;line-height:1.7">Haz clic en el botón para confirmar. Si no solicitaste la baja, ignora este email y seguirás recibiendo las noticias.</p>
            <div style="text-align:center;margin:28px 0">
              <a href="${unsubUrl}" style="background:#dc2626;color:#fff;padding:14px 28px;border-radius:8px;font-weight:700;text-decoration:none;font-size:15px">Confirmar baja</a>
            </div>
            <p style="color:#9ca3af;font-size:12px;text-align:center">Si el botón no funciona, copia este enlace en tu navegador:<br/><span style="word-break:break-all">${unsubUrl}</span></p>
          </div>
          <div style="background:#0d1f35;padding:16px;text-align:center;border-radius:0 0 12px 12px">
            <p style="color:rgba(255,255,255,.4);font-size:11px;margin:0">LEVANTA · levantalamancha@levanta.email · +34 659 681 684</p>
          </div>
        </div>`
      })
    });

    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', ...cors } });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } });
  }
};
