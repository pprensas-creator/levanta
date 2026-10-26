import { getStore } from "@netlify/blobs";
import { SITE, OWNER, PENDING_DAYS, esc, confirmToken, unsubUrl, isValidEmail, sendMail, mailShell, htmlPage } from "../lib/subs.js";

const page = (status, ...args) => new Response(htmlPage(...args), { status, headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store' } });

export default async (req) => {
  const url = new URL(req.url);
  const email = (url.searchParams.get('email') || '').toLowerCase().trim();
  const token = url.searchParams.get('token') || '';

  if (!isValidEmail(email) || !token || token !== confirmToken(email)) {
    return page(403, 'Error', '🔒', 'Enlace no válido', 'El enlace de confirmación no es correcto o está incompleto. Puedes volver a suscribirte desde la web o escribirme a <strong>levantalamancha@levanta.email</strong>.');
  }

  try {
    const store = getStore({ name: 'levanta-subs', consistency: 'strong' });
    const sub = await store.get(email, { type: 'json' }).catch(() => null);

    if (!sub) return page(200, 'Solicitud no encontrada', 'ℹ️', 'No encuentro tu solicitud', 'Puede que haya caducado (se borran a los 30 días) o que ya te hayas dado de baja. Puedes volver a suscribirte desde la web.');
    if (sub.status === undefined || sub.status === 'confirmed') return page(200, 'Suscripción confirmada', '✅', 'Tu suscripción ya estaba confirmada', 'Recibirás LEVANTA IA News cada lunes.', '#4a6e1a');

    const ageDays = (Date.now() - new Date(sub.requestedAt).getTime()) / 86400000;
    if (ageDays > PENDING_DAYS) {
      await store.delete(email);
      return page(200, 'Enlace caducado', '⌛', 'El enlace ha caducado', 'La solicitud tenía más de 30 días y la he borrado. Puedes volver a suscribirte desde la web.');
    }

    await store.set(email, JSON.stringify({ ...sub, status: 'confirmed', confirmedAt: new Date().toISOString() }));

    // Bienvenida y aviso al propietario (ahora sí: el alta es válida)
    try {
      await sendMail({
        to: email, reply_to: OWNER,
        subject: '✅ Suscripción confirmada: LEVANTA IA News cada lunes',
        html: mailShell(`
          <h2 style="color:#1a4f82">Hola ${esc(sub.name)}, ¡bienvenido a LEVANTA IA News!</h2>
          <p style="color:#4b5563;line-height:1.7">Cada <strong>lunes a primera hora</strong> recibirás las <strong>6 noticias más relevantes de la semana</strong> para tu empresa, seleccionadas por inteligencia artificial, con enlace a la fuente original.</p>
          <div style="text-align:center;margin:28px 0"><a href="https://calendly.com/pprensas" style="background:#4a6e1a;color:#fff;padding:14px 28px;border-radius:8px;font-weight:700;text-decoration:none;font-size:15px">📅 Agenda tu diagnóstico gratuito</a></div>
          <p style="color:#4b5563;line-height:1.7;margin:0">Pablo Prensa · Fundador de LEVANTA<br/>📞 +34 659 681 684 · levantalamancha@levanta.email</p>`,
          `¿No quieres recibir más emails? <a href="${unsubUrl(email)}" style="color:rgba(255,255,255,.5);text-decoration:underline">Darte de baja aquí</a>`),
      });
      await sendMail({
        to: OWNER,
        subject: `🆕 Nuevo suscriptor confirmado: ${sub.name}${sub.company ? ' · ' + sub.company : ''}`,
        html: `<div style="font-family:Arial,sans-serif;padding:24px;max-width:500px"><h2 style="color:#1a4f82">Suscriptor confirmado (doble opt-in)</h2>
          <p>Nombre: <strong>${esc(sub.name)}</strong><br/>Empresa: ${esc(sub.company || '—')}<br/>Email: ${esc(email)}<br/>Sector: ${esc(sub.sector || '—')}<br/>Alta: ${esc(sub.requestedAt)}<br/>Confirmación: ${new Date().toISOString()}</p></div>`,
      });
    } catch (e) { console.error('confirm: email', e && e.message); }

    return page(200, 'Suscripción confirmada', '✅', '¡Suscripción confirmada!', 'Gracias. Recibirás LEVANTA IA News cada lunes. Te acabo de enviar un email de bienvenida.', '#4a6e1a');
  } catch (e) {
    console.error('confirm:', e && e.message);
    return page(500, 'Error', '⚠️', 'Error al confirmar', 'Ha ocurrido un error. Escríbeme a <strong>levantalamancha@levanta.email</strong> y lo resolvemos.');
  }
};
