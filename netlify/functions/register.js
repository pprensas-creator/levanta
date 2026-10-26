import { getStore } from "@netlify/blobs";
import { SITE, OWNER, esc, confirmUrl, isActive, isValidEmail, sendMail, mailShell, overIpLimit } from "../lib/subs.js";

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': SITE, 'Vary': 'Origin' },
});

// Alta en dos pasos (doble opt-in): se guarda como "pending" y solo pasa a "confirmed"
// cuando la persona pulsa el enlace del email (ver confirm.js).
export default async (req, context) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': SITE, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  try {
    const body = await req.json();
    if (body.web) return json({ ok: true });   // campo trampa para bots: se ignora en silencio
    const name = String(body.name || '').trim().slice(0, 100);
    const company = String(body.company || '').trim().slice(0, 150);
    const sector = String(body.sector || '').trim().slice(0, 60);
    const emailClean = String(body.email || '').toLowerCase().trim();
    if (!name || !isValidEmail(emailClean)) return json({ error: 'Revisa tu nombre y tu email.' }, 400);

    // Antispam: 5 altas por IP y día, 60 en total (el plan gratuito de Resend admite 100 emails/día)
    if (await overIpLimit('register', context && context.ip, 5, 60)) return json({ error: 'Demasiados intentos hoy. Inténtalo mañana o escríbeme a levantalamancha@levanta.email.' }, 429);

    const store = getStore({ name: 'levanta-subs', consistency: 'strong' });
    const prev = await store.get(emailClean, { type: 'json' }).catch(() => null);

    // Ya suscrito y confirmado: respuesta neutra, sin reenviar nada (no revela quién está en la lista)
    if (prev && isActive(prev)) return json({ ok: true });
    // Pendiente reciente: no se reenvía el email antes de 10 minutos
    if (prev && prev.status === 'pending' && Date.now() - new Date(prev.requestedAt).getTime() < 10 * 60 * 1000) return json({ ok: true });

    await store.set(emailClean, JSON.stringify({
      name, email: emailClean, company, sector,
      status: 'pending',
      requestedAt: new Date().toISOString(),   // fecha de alta (solicitud)
      confirmedAt: null,                        // se rellena al confirmar
    }));

    await sendMail({
      to: emailClean,
      reply_to: OWNER,
      subject: 'Confirma tu suscripción a LEVANTA IA News',
      html: mailShell(`
        <h2 style="color:#1a4f82">Hola ${esc(name)}, falta un paso</h2>
        <p style="color:#4b5563;line-height:1.7">Has pedido recibir <strong>LEVANTA IA News</strong>: cada lunes, 6 noticias reales para tu empresa, con enlace a la fuente.</p>
        <p style="color:#4b5563;line-height:1.7">Para activar la suscripción, confirma que este email es tuyo:</p>
        <div style="text-align:center;margin:28px 0"><a href="${confirmUrl(emailClean)}" style="background:#4a6e1a;color:#fff;padding:14px 28px;border-radius:8px;font-weight:700;text-decoration:none;font-size:15px">Confirmar mi suscripción</a></div>
        <p style="color:#9ca3af;font-size:12px;line-height:1.6">Si no has sido tú, ignora este mensaje: no recibirás nada y borraré tu solicitud en 30 días.<br/>Si el botón no funciona, copia este enlace en tu navegador:<br/><span style="word-break:break-all">${confirmUrl(emailClean)}</span></p>`,
        'Responsable: Pablo Prensa Sepúlveda · levantalamancha@levanta.email'),
    });

    return json({ ok: true });
  } catch (e) {
    console.error('register:', e && e.message);
    return json({ error: 'No he podido completar el alta. Inténtalo de nuevo en unos minutos.' }, 500);
  }
};
