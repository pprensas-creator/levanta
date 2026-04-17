import { getStore } from "@netlify/blobs";

export default async () => {
  try {
    const KEY = process.env.RESEND_API_KEY;
    const FROM = 'Pablo Prensa · LEVANTA <noticias@levanta-lamancha.es>';
    const today = new Date().toISOString().split('T')[0];
    const fechaEs = new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // ── 1. Leer noticias del día (generadas por trigger-news o daily-news) ────
    const newsStore = getStore({ name: 'levanta-news', consistency: 'strong' });
    const cached = await newsStore.get(today);
    if (!cached) {
      console.error('No hay noticias para hoy', today, '— newsletter no enviada');
      return;
    }
    const { news } = JSON.parse(cached);
    if (!Array.isArray(news) || news.length < 1) {
      console.error('Noticias vacías — newsletter no enviada');
      return;
    }

    // ── 2. Leer todos los suscriptores ────────────────────────────────────────
    const subsStore = getStore({ name: 'levanta-subs', consistency: 'strong' });
    const { keys } = await subsStore.list();
    if (!keys || keys.length === 0) {
      console.log('Sin suscriptores — newsletter no enviada');
      return;
    }

    console.log(`Enviando newsletter a ${keys.length} suscriptores...`);

    // ── 3. Construir HTML de las noticias ─────────────────────────────────────
    const newsHtml = news.map(n => {
      const hoyBadge = n.isToday
        ? `<span style="display:inline-block;background:#eaf3de;color:#4a6e1a;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;margin-bottom:6px;letter-spacing:.5px">● HOY</span><br/>`
        : '';
      const fuenteHtml = (n.url && n.url.startsWith('http'))
        ? `<a href="${n.url}" style="color:#6b7280;font-size:11px;text-decoration:none">${n.fuente} ↗</a>`
        : `<span style="color:#9ca3af;font-size:11px">${n.fuente || ''}</span>`;
      const fechaHtml = n.fecha ? `<span style="color:#9ca3af;font-size:11px;margin-left:8px">${n.fecha}</span>` : '';

      return `
      <div style="border:1px solid #e2e8d8;border-radius:10px;padding:16px;margin-bottom:12px;background:#fff">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#638a28;margin-bottom:6px">${n.icono} ${n.servicio}</div>
        ${hoyBadge}
        <div style="font-size:15px;font-weight:700;color:#1e2a1e;line-height:1.35;margin-bottom:8px">${n.titular}</div>
        <div style="font-size:13px;color:#4b5563;line-height:1.6;margin-bottom:10px">${n.resumen}</div>
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px">
          <div>${fuenteHtml}${fechaHtml}</div>
          <div style="font-size:12px;color:#4a6e1a;font-style:italic">${n.cta}</div>
        </div>
      </div>`;
    }).join('');

    // ── 4. Enviar a cada suscriptor ───────────────────────────────────────────
    let sent = 0;
    let errors = 0;

    for (const { key: email } of keys) {
      try {
        const subData = await subsStore.get(email);
        const sub = subData ? JSON.parse(subData) : { name: '', email };
        const name = sub.name || 'empresario';

        // Generar token de baja
        const { createHmac } = await import('crypto');
        const token = createHmac('sha256', process.env.TRIGGER_KEY)
          .update(email.toLowerCase().trim())
          .digest('hex');
        const unsubUrl = `https://levanta-lamancha.netlify.app/.netlify/functions/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;

        const emailHtml = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1a4f82,#0d3360,#2a4a10);padding:24px 32px;border-radius:12px 12px 0 0;display:flex;align-items:center;justify-content:space-between">
    <div>
      <div style="font-size:22px;font-weight:800;letter-spacing:3px;color:#fff">LEVANTA</div>
      <div style="font-size:11px;color:rgba(255,255,255,.7)">Consultoría · La Mancha</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:11px;color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:1px">IA News semanal</div>
      <div style="font-size:12px;font-weight:700;color:#86c94a">${fechaEs}</div>
    </div>
  </div>

  <!-- Intro -->
  <div style="padding:24px 32px 16px;background:#f8f6f0;border-left:1px solid #e2e8d8;border-right:1px solid #e2e8d8">
    <p style="color:#374151;font-size:14px;line-height:1.7;margin:0">Hola <strong>${name}</strong>, aquí tienes las <strong>${news.length} noticias más relevantes de la semana</strong> para tu empresa. Seleccionadas por IA entre cientos de fuentes españolas.</p>
  </div>

  <!-- Noticias -->
  <div style="padding:16px 32px;background:#f8f6f0;border-left:1px solid #e2e8d8;border-right:1px solid #e2e8d8">
    ${newsHtml}
  </div>

  <!-- CTA -->
  <div style="padding:24px 32px;background:#fff;border:1px solid #e2e8d8;text-align:center">
    <p style="color:#4b5563;font-size:13px;margin:0 0 16px">¿Alguna de estas noticias afecta a tu empresa? Hablamos.</p>
    <a href="https://calendly.com/pprensas" style="background:#4a6e1a;color:#fff;padding:12px 24px;border-radius:8px;font-weight:700;text-decoration:none;font-size:14px;display:inline-block">📅 Agenda tu diagnóstico gratuito</a>
  </div>

  <!-- Firma -->
  <div style="padding:20px 32px;background:#fff;border:1px solid #e2e8d8;border-top:none">
    <div style="background:#f8f6f0;border-radius:10px;padding:16px;display:flex;gap:12px;align-items:center">
      <img src="https://i.postimg.cc/Vv1sNDff/Chat-GPT-Image-Jan-15-2026-05-48-06-PM.jpg" style="width:50px;height:50px;border-radius:50%;object-fit:cover;border:3px solid #4a6e1a;flex-shrink:0"/>
      <div>
        <div style="font-weight:700;color:#1a4f82;font-size:13px">Pablo Prensa · Fundador LEVANTA</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">📞 +34 659 681 684 · levantalamancha@levanta.email</div>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div style="background:#0d1f35;padding:16px 32px;text-align:center;border-radius:0 0 12px 12px">
    <p style="color:rgba(255,255,255,.4);font-size:11px;margin:0">
      Recibes este email porque te suscribiste en levanta-lamancha.es ·
      <a href="${unsubUrl}" style="color:rgba(255,255,255,.4);text-decoration:underline">Darte de baja</a>
    </p>
  </div>
</div>`;

        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: FROM,
            to: email,
            subject: `📰 LEVANTA IA News · Semana del ${fechaEs}`,
            html: emailHtml
          })
        });

        if (r.ok) { sent++; } else { errors++; console.error('Error enviando a', email, await r.text()); }

        // Pequeña pausa para no saturar Resend (100 emails/día plan free)
        await new Promise(res => setTimeout(res, 200));

      } catch (err) {
        errors++;
        console.error('Error procesando suscriptor', email, err.message);
      }
    }

    console.log(`Newsletter enviada: ${sent} OK, ${errors} errores`);

  } catch (e) {
    console.error('Error general weekly-newsletter:', e.message);
  }
};

// Todos los lunes a las 7:00 AM UTC (8:00 hora España invierno, 9:00 verano)
export const config = { schedule: '0 7 * * 1' };
