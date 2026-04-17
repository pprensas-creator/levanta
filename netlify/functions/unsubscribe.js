import { getStore } from "@netlify/blobs";
import { createHmac } from "crypto";

// Genera o verifica el token de baja (HMAC-SHA256 del email con la TRIGGER_KEY)
function generateToken(email) {
  return createHmac('sha256', process.env.TRIGGER_KEY)
    .update(email.toLowerCase().trim())
    .digest('hex');
}

function htmlPage(title, emoji, heading, body, color = '#1a4f82') {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title} · LEVANTA</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',system-ui,sans-serif;background:#f8f6f0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1rem}
  .card{background:#fff;border-radius:16px;padding:2.5rem 2rem;max-width:480px;width:100%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.08)}
  .logo{font-size:1.5rem;font-weight:800;letter-spacing:3px;color:${color};margin-bottom:.25rem}
  .sub{font-size:11px;color:#6b7280;margin-bottom:2rem}
  .emoji{font-size:3.5rem;margin-bottom:1rem;display:block}
  h1{font-size:1.3rem;font-weight:700;color:#1e2a1e;margin-bottom:.75rem}
  p{color:#6b7280;font-size:14px;line-height:1.7;margin-bottom:1.5rem}
  .btn{display:inline-block;background:${color};color:#fff;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none}
  .footer{margin-top:1.5rem;font-size:11px;color:#9ca3af}
</style>
</head>
<body>
<div class="card">
  <div class="logo">LEVANTA</div>
  <div class="sub">Consultoría · La Mancha</div>
  <span class="emoji">${emoji}</span>
  <h1>${heading}</h1>
  <p>${body}</p>
  <a href="https://levanta-lamancha.netlify.app" class="btn">Volver a LEVANTA</a>
  <div class="footer">levantalamancha@levanta.email · +34 659 681 684</div>
</div>
</body>
</html>`;
}

export default async (req) => {
  const url = new URL(req.url);
  const email = (url.searchParams.get('email') || '').toLowerCase().trim();
  const token = url.searchParams.get('token') || '';

  // Validar parámetros
  if (!email || !token) {
    return new Response(
      htmlPage('Error', '❌', 'Enlace no válido',
        'El enlace de baja no es válido o está incompleto. Si quieres darte de baja, escríbenos a <strong>levantalamancha@levanta.email</strong>.'),
      { status: 400, headers: { 'Content-Type': 'text/html;charset=utf-8' } }
    );
  }

  // Verificar token
  const expectedToken = generateToken(email);
  if (token !== expectedToken) {
    return new Response(
      htmlPage('Error', '🔒', 'Enlace no válido',
        'El token de seguridad no es correcto. Si quieres darte de baja, escríbenos a <strong>levantalamancha@levanta.email</strong>.'),
      { status: 403, headers: { 'Content-Type': 'text/html;charset=utf-8' } }
    );
  }

  try {
    const store = getStore({ name: 'levanta-subs', consistency: 'strong' });
    const existing = await store.get(email);

    if (!existing) {
      return new Response(
        htmlPage('Ya dado de baja', '✅', 'Ya estabas dado de baja',
          `El email <strong>${email}</strong> no está en nuestra lista. Es posible que ya te hayas dado de baja anteriormente.`),
        { status: 200, headers: { 'Content-Type': 'text/html;charset=utf-8' } }
      );
    }

    await store.delete(email);

    // Notificar a Pablo
    const KEY = process.env.RESEND_API_KEY;
    if (KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Pablo Prensa · LEVANTA <noticias@levanta-lamancha.es>',
          to: 'levantalamancha@levanta.email',
          subject: `🔕 Baja en IA News: ${email}`,
          html: `<div style="font-family:Arial,sans-serif;padding:24px;max-width:500px">
            <h2 style="color:#dc2626">Baja en newsletter</h2>
            <p style="color:#4b5563">El usuario <strong>${email}</strong> se ha dado de baja de IA News el ${new Date().toLocaleDateString('es-ES')}.</p>
          </div>`
        })
      });
    }

    return new Response(
      htmlPage('Baja confirmada', '👋', 'Te has dado de baja correctamente',
        `El email <strong>${email}</strong> ha sido eliminado de nuestra lista. Ya no recibirás más correos de LEVANTA IA News.<br/><br/>Si fue un error, puedes volver a suscribirte en la web.`,
        '#4a6e1a'),
      { status: 200, headers: { 'Content-Type': 'text/html;charset=utf-8' } }
    );

  } catch (e) {
    return new Response(
      htmlPage('Error', '⚠️', 'Error al procesar la baja',
        'Ha ocurrido un error. Por favor escríbenos a <strong>levantalamancha@levanta.email</strong> y te daremos de baja manualmente.'),
      { status: 500, headers: { 'Content-Type': 'text/html;charset=utf-8' } }
    );
  }
};
