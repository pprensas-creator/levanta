import { createHmac, createHash } from "crypto";
import { getStore } from "@netlify/blobs";

export const SITE = 'https://levanta-lamancha.es';
export const FROM = 'Pablo Prensa · LEVANTA <noticias@levanta-lamancha.es>';
export const OWNER = 'levantalamancha@levanta.email';
export const PENDING_DAYS = 30;

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const hmac = (msg) => createHmac('sha256', process.env.TRIGGER_KEY || '').update(msg).digest('hex');
const norm = (email) => String(email || '').toLowerCase().trim();

// Token de baja (el mismo que ya usaban los emails enviados hasta ahora)
export const unsubToken = (email) => hmac(norm(email));
// Token de confirmación (doble opt-in): distinto del de baja
export const confirmToken = (email) => hmac('confirm:' + norm(email));

export const unsubUrl = (email) =>
  `${SITE}/.netlify/functions/unsubscribe?email=${encodeURIComponent(norm(email))}&token=${unsubToken(email)}`;
export const confirmUrl = (email) =>
  `${SITE}/.netlify/functions/confirm?email=${encodeURIComponent(norm(email))}&token=${confirmToken(email)}`;

// Suscriptores anteriores al doble opt-in no tienen "status": se tratan como confirmados.
export const isActive = (sub) => !sub || sub.status === undefined || sub.status === 'confirmed';

export const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '')) && String(e).length <= 254;

export async function sendMail(payload) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, ...payload }),
  });
  if (!r.ok) throw new Error('Resend ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r;
}

export function mailShell(inner, footer) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
  <div style="background:linear-gradient(135deg,#1a4f82,#0d3360,#2a4a10);padding:32px;text-align:center;border-radius:12px 12px 0 0">
    <div style="font-size:28px;font-weight:800;letter-spacing:4px;color:#fff">LEVANTA</div>
    <div style="font-size:12px;color:rgba(255,255,255,.7)">Consultoría · La Mancha</div>
  </div>
  <div style="padding:32px;background:#fff;border:1px solid #e2e8d8">${inner}</div>
  <div style="background:#0d1f35;padding:16px;text-align:center;border-radius:0 0 12px 12px">
    <p style="color:rgba(255,255,255,.4);font-size:11px;margin:0">${footer || 'LEVANTA · levantalamancha@levanta.email · +34 659 681 684'}</p>
  </div>
</div>`;
}

export function htmlPage(title, emoji, heading, body, color = '#1a4f82') {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex"/><title>${title} · LEVANTA</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',system-ui,sans-serif;background:#f8f6f0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1rem}
.card{background:#fff;border-radius:16px;padding:2.5rem 2rem;max-width:480px;width:100%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.08)}
.logo{font-size:1.5rem;font-weight:800;letter-spacing:3px;color:${color};margin-bottom:.25rem}.sub{font-size:11px;color:#6b7280;margin-bottom:2rem}
.emoji{font-size:3.5rem;margin-bottom:1rem;display:block}h1{font-size:1.3rem;font-weight:700;color:#1e2a1e;margin-bottom:.75rem}
p{color:#6b7280;font-size:14px;line-height:1.7;margin-bottom:1.5rem}.btn{display:inline-block;background:${color};color:#fff;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none}
.footer{margin-top:1.5rem;font-size:11px;color:#9ca3af}</style></head>
<body><div class="card"><div class="logo">LEVANTA</div><div class="sub">Consultoría · La Mancha</div><span class="emoji">${emoji}</span>
<h1>${heading}</h1><p>${body}</p><a href="${SITE}" class="btn">Volver a LEVANTA</a>
<div class="footer">levantalamancha@levanta.email · +34 659 681 684</div></div></body></html>`;
}

// ── Límite diario por IP y total (antispam) ──────────────────────────────────
// No se guarda la IP: solo un hash con sal secreta y la fecha. Los contadores de días
// anteriores se borran de vez en cuando. Si el almacenamiento falla, se deja pasar.
export async function overIpLimit(name, ip, maxPerIp, maxTotal) {
  try {
    const store = getStore({ name: `levanta-limits-${name}`, consistency: 'strong' });
    const day = new Date().toISOString().slice(0, 10);
    const salt = process.env.CHAT_LIMIT_SALT || process.env.TRIGGER_KEY || '';
    const kIp = `${day}/ip-${createHash('sha256').update(`${salt}|${day}|${ip || 'sin-ip'}`).digest('hex').slice(0, 24)}`;
    const kTotal = `${day}/total`;
    const [a, t] = await Promise.all([store.get(kIp), store.get(kTotal)]);
    const nIp = parseInt(a || '0', 10), nTotal = parseInt(t || '0', 10);
    if (nIp >= maxPerIp || nTotal >= maxTotal) return true;
    await Promise.all([store.set(kIp, String(nIp + 1)), store.set(kTotal, String(nTotal + 1))]);
    if (Math.random() < 0.05) {
      const { blobs } = await store.list();
      await Promise.all(blobs.filter((b) => !b.key.startsWith(day + '/')).map((b) => store.delete(b.key)));
    }
    return false;
  } catch (e) {
    console.error(`límite ${name}: no disponible, se permite la petición`, e && e.message);
    return false;
  }
}
