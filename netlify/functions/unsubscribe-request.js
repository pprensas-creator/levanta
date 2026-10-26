import { getStore } from "@netlify/blobs";
import { SITE, esc, isValidEmail, sendMail, mailShell, unsubUrl } from "../lib/subs.js";

// Solo la web puede llamar a este endpoint desde un navegador
const cors = {
  'Access-Control-Allow-Origin': SITE,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Vary': 'Origin',
};

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors },
});

const GENERIC_ERROR = 'No he podido procesar la solicitud. Inténtalo de nuevo en unos minutos o escríbeme a levantalamancha@levanta.email.';

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  try {
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Solicitud no válida' }, 400); }

    const emailClean = String(body?.email || '').toLowerCase().trim();
    if (!isValidEmail(emailClean)) return json({ error: 'Escribe un email válido' }, 400);

    // Si el email no está en la lista, se responde igual para no revelar quién está suscrito
    const store = getStore({ name: 'levanta-subs', consistency: 'strong' });
    const existing = await store.get(emailClean);
    if (!existing) return json({ ok: true });

    const url = unsubUrl(emailClean);
    await sendMail({
      to: emailClean,
      subject: 'Confirma tu baja en LEVANTA IA News',
      html: mailShell(`
        <h2 style="color:#1a4f82">Solicitud de baja recibida</h2>
        <p style="color:#4b5563;line-height:1.7">Hemos recibido tu solicitud para darte de baja de <strong>LEVANTA IA News</strong>.</p>
        <p style="color:#4b5563;line-height:1.7">Haz clic en el botón para confirmar. Si no solicitaste la baja, ignora este email y seguirás recibiendo las noticias.</p>
        <div style="text-align:center;margin:28px 0">
          <a href="${esc(url)}" style="background:#dc2626;color:#fff;padding:14px 28px;border-radius:8px;font-weight:700;text-decoration:none;font-size:15px">Confirmar baja</a>
        </div>
        <p style="color:#6b7280;font-size:12px;text-align:center">Si el botón no funciona, copia este enlace en tu navegador:<br/><span style="word-break:break-all">${esc(url)}</span></p>`),
    });

    return json({ ok: true });
  } catch (e) {
    // El detalle solo va al log de Netlify; al visitante, un mensaje genérico
    console.error('unsubscribe-request:', e && e.message);
    return json({ error: GENERIC_ERROR }, 500);
  }
};
