import { getStore } from "@netlify/blobs";
import { createHash } from "crypto";
import { SITE, OWNER, esc, isValidEmail, sendMail, mailShell, overIpLimit } from "../lib/subs.js";
import { buildDiagnosticoPdf, validateScores, interpretation } from "../lib/diag-pdf.js";

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': SITE, 'Vary': 'Origin', 'Cache-Control': 'no-store' },
});

const MAX_PER_EMAIL_DAY = 3;   // por destinatario y día
const MAX_PER_DAY = 40;        // total diario (el plan gratuito de Resend admite 100 emails/día)

// Límite diario sin guardar datos personales: la clave es un hash del email
async function overLimit(email) {
  const store = getStore({ name: 'levanta-diag-limits', consistency: 'strong' });
  const day = new Date().toISOString().slice(0, 10);
  const kEmail = `${day}:${createHash('sha256').update(email).digest('hex').slice(0, 24)}`;
  const kTotal = `${day}:total`;
  const [a, t] = await Promise.all([store.get(kEmail).catch(() => null), store.get(kTotal).catch(() => null)]);
  const nA = parseInt(a || '0', 10), nT = parseInt(t || '0', 10);
  if (nA >= MAX_PER_EMAIL_DAY || nT >= MAX_PER_DAY) return true;
  await Promise.all([store.set(kEmail, String(nA + 1)), store.set(kTotal, String(nT + 1))]);
  return false;
}

export default async (req, context) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': SITE, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  try {
    const b = await req.json();
    if (b.web) return json({ ok: true });   // campo trampa para bots: se ignora en silencio

    const nombre = String(b.nombre || '').trim().slice(0, 100);
    const empresa = String(b.empresa || '').trim().slice(0, 150);
    const email = String(b.email || '').toLowerCase().trim();
    const totals = validateScores(b.scores);
    if (!nombre || !empresa || !isValidEmail(email)) return json({ error: 'Revisa tu nombre, tu empresa y tu email.' }, 400);
    if (!totals) return json({ error: 'Responde las 24 preguntas del test antes de enviar el informe.' }, 400);

    if (await overIpLimit('diag', context && context.ip, 5, 40)) return json({ error: 'Has pedido varios informes hoy. Inténtalo mañana o escríbeme a levantalamancha@levanta.email.' }, 429);
    if (await overLimit(email)) return json({ error: 'Ya te he enviado varios informes hoy. Inténtalo mañana o escríbeme a levantalamancha@levanta.email.' }, 429);

    const fecha = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Europe/Madrid' });
    const pdf = await buildDiagnosticoPdf({ nombre, empresa, totals, fecha });
    const grand = totals.reduce((a, c) => a + c, 0);

    await sendMail({
      to: email,
      bcc: OWNER,                 // copia para Pablo
      reply_to: OWNER,
      subject: `Tu Diagnóstico Express LEVANTA: ${grand}/120`,
      html: mailShell(`
        <h2 style="color:#1a4f82">Hola ${esc(nombre)}, aquí tienes tu informe</h2>
        <p style="color:#4b5563;line-height:1.7">Te adjunto en PDF el resultado del <strong>Diagnóstico Express</strong> de <strong>${esc(empresa)}</strong>: <strong>${grand}/120</strong>. ${esc(interpretation(grand))}</p>
        <p style="color:#4b5563;line-height:1.7">El informe incluye tu puntuación por área y las 3 prioridades de mejora. Si quieres que lo repasemos juntos, agenda una sesión gratuita de 30 minutos conmigo:</p>
        <div style="text-align:center;margin:28px 0"><a href="https://calendly.com/pprensas" style="background:#4a6e1a;color:#fff;padding:14px 28px;border-radius:8px;font-weight:700;text-decoration:none;font-size:15px">📅 Agenda tu diagnóstico gratuito</a></div>
        <p style="color:#4b5563;line-height:1.7;margin:0">Pablo Prensa · Fundador de LEVANTA<br/>📞 +34 659 681 684 · levantalamancha@levanta.email</p>`,
        'He enviado este email porque has pedido el informe en levanta-lamancha.es. No te añado a ninguna lista de correo. Responsable: Pablo Prensa Sepúlveda.'),
      attachments: [{ filename: 'Diagnostico_Express_LEVANTA.pdf', content: pdf.toString('base64') }],
    });

    return json({ ok: true });
  } catch (e) {
    console.error('send-diagnostico:', e && e.message);
    return json({ error: 'No he podido enviar el informe. Inténtalo de nuevo en unos minutos o escríbeme a levantalamancha@levanta.email.' }, 500);
  }
};
