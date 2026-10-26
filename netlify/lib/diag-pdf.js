import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const SNAMES = ['Eficiencia Operativa y Finanzas', 'Información y Datos', 'Atención al Cliente', 'Tecnología y Digitalización', 'Equipo y Liderazgo', 'Imagen de Marca y Online'];
// Valores de referencia: ESTIMACIÓN LEVANTA (no proceden de un estudio estadístico)
const BM = [8, 7, 7, 7, 9, 7], BE = [10, 9, 9, 10, 11, 9], TOP25 = [17, 17, 16, 18, 17, 15];
const RMSG = [
  'Mapear los procesos de facturación y pagos e identificar los 3 mayores focos de gasto innecesario. Se puede hacer sin inversión, solo con método.',
  'Crear un cuadro de mando con 5-8 indicadores clave: ventas, margen, clientes activos y morosidad. Con una hoja de cálculo puede estar listo en días.',
  'Implantar un protocolo de seguimiento postventa: un mensaje a los 7 días de cada servicio y una pregunta simple de satisfacción.',
  'Revisar las herramientas actuales y valorar, por fases, si un programa de gestión básico resuelve los principales cuellos de botella.',
  'Definir roles por escrito, fijar objetivos medibles y hacer una reunión semanal de seguimiento de 30 minutos con el equipo.',
  'Actualizar el perfil de Google Business (gratis), comprobar que la web se ve bien en el móvil y publicar en redes al menos una vez por semana.',
];

const NAVY = rgb(0.102, 0.31, 0.51), GREEN = rgb(0.29, 0.43, 0.10), GREY = rgb(0.42, 0.45, 0.5), INK = rgb(0.12, 0.16, 0.12);

export function validateScores(sc) {
  if (!sc || typeof sc !== 'object') return null;
  const out = [];
  for (let s = 1; s <= 6; s++) {
    let t = 0;
    for (let q = 1; q <= 4; q++) {
      const v = sc[s + '_' + q];
      if (!Number.isInteger(v) || v < 1 || v > 5) return null;
      t += v;
    }
    out.push(t);
  }
  return out;
}

export const interpretation = (g) =>
  g >= 90 ? 'Madurez alta. Puedes optimizar con proyectos selectivos de alto retorno.' :
  g >= 60 ? 'Madurez media. Hay oportunidades claras de crecimiento rápido.' :
  g >= 30 ? 'Madurez baja. Hay un gran potencial de mejora.' : 'Situación inicial. El camino empieza aquí.';

// Las fuentes estándar de PDF solo admiten WinAnsi: se descarta cualquier otro carácter (p. ej. emojis)
const clean = (t) => String(t ?? '').replace(/[^ -~ -ÿ€–—‘’“”•…]/g, '').replace(/\s+/g, ' ').trim();

export async function buildDiagnosticoPdf({ nombre, empresa, totals, fecha }) {
  const doc = await PDFDocument.create();
  doc.setTitle('Diagnóstico Express LEVANTA');
  doc.setAuthor('LEVANTA · Pablo Prensa');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595.28, 841.89]);
  const W = 595.28, M = 40;
  let y = 841.89;

  const text = (t, x, yy, size, f = font, color = INK) => page.drawText(clean(t), { x, y: yy, size, font: f, color });
  const wrap = (t, size, f, maxW) => {
    const words = clean(t).split(' '), lines = []; let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (f.widthOfTextAtSize(test, size) > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  };

  // Cabecera
  page.drawRectangle({ x: 0, y: y - 96, width: W, height: 96, color: NAVY });
  text('LEVANTA', M, y - 46, 26, bold, rgb(1, 1, 1));
  text('Consultoría de desarrollo local · La Mancha', M, y - 64, 10, font, rgb(0.85, 0.9, 0.95));
  text('Diagnóstico Express', M, y - 84, 12, bold, rgb(0.53, 0.79, 0.29));
  const prep = 'Preparado para';
  text(prep, W - M - font.widthOfTextAtSize(prep, 9), y - 40, 9, font, rgb(0.85, 0.9, 0.95));
  const who = clean(nombre).slice(0, 38);
  text(who, W - M - bold.widthOfTextAtSize(who, 12), y - 56, 12, bold, rgb(1, 1, 1));
  const emp = clean(empresa).slice(0, 44);
  text(emp, W - M - font.widthOfTextAtSize(emp, 10), y - 71, 10, font, rgb(1, 1, 1));
  text(fecha, W - M - font.widthOfTextAtSize(fecha, 9), y - 85, 9, font, rgb(0.85, 0.9, 0.95));
  y -= 96 + 22;

  // Resultado global
  const grand = totals.reduce((a, b) => a + b, 0);
  page.drawRectangle({ x: M, y: y - 56, width: W - 2 * M, height: 56, color: rgb(0.97, 0.96, 0.94), borderColor: rgb(0.89, 0.91, 0.85), borderWidth: 1 });
  text(String(grand), M + 16, y - 38, 30, bold, NAVY);
  text('/ 120', M + 16 + bold.widthOfTextAtSize(String(grand), 30) + 4, y - 38, 11, font, GREY);
  text('RESULTADO', M + 130, y - 22, 8, bold, GREEN);
  for (const [i, l] of wrap(interpretation(grand), 11, bold, W - 2 * M - 150).entries()) text(l, M + 130, y - 36 - i * 13, 11, bold);
  y -= 56 + 24;

  // Áreas
  text('Puntuaciones por área y comparativa', M, y, 12, bold, NAVY); y -= 8;
  const barX = M + 190, barW = 230;
  totals.forEach((v, i) => {
    y -= 30;
    const pct = v / 20, col = pct <= 0.35 ? rgb(0.86, 0.15, 0.15) : pct <= 0.6 ? rgb(0.85, 0.47, 0.02) : rgb(0.09, 0.64, 0.29);
    text(SNAMES[i], M, y + 6, 10, bold);
    page.drawRectangle({ x: barX, y: y + 3, width: barW, height: 10, color: rgb(0.92, 0.93, 0.9) });
    page.drawRectangle({ x: barX, y: y + 3, width: Math.max(2, barW * pct), height: 10, color: col });
    text(`${v}/20`, barX + barW + 10, y + 4, 10, bold, col);
    text(`Est. LEVANTA: pyme media La Mancha ${BM[i]} · España ${BE[i]} · top 25 % ${TOP25[i]}`, M, y - 7, 7.5, font, GREY);
  });
  y -= 22;
  for (const l of wrap('* Los valores de referencia son una estimación de LEVANTA basada en la experiencia de Pablo Prensa con pymes. No proceden de un estudio estadístico y son solo orientativos.', 7.5, font, W - 2 * M)) { text(l, M, y, 7.5, font, GREY); y -= 10; }
  y -= 14;

  // Prioridades
  text('Tus 3 prioridades de mejora', M, y, 12, bold, NAVY); y -= 8;
  const order = totals.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v).slice(0, 3);
  order.forEach((o, n) => {
    const lines = wrap(RMSG[o.i], 9.5, font, W - 2 * M - 22);
    const h = 28 + lines.length * 12.5;
    y -= h + 6;
    const col = o.v / 20 <= 0.35 ? rgb(0.86, 0.15, 0.15) : o.v / 20 <= 0.6 ? rgb(0.85, 0.47, 0.02) : rgb(0.09, 0.64, 0.29);
    page.drawRectangle({ x: M, y, width: W - 2 * M, height: h, color: rgb(0.97, 0.96, 0.94) });
    page.drawRectangle({ x: M, y, width: 4, height: h, color: col });
    text(`PRIORIDAD ${n + 1} · ${SNAMES[o.i]} (${o.v}/20)`, M + 14, y + h - 16, 8.5, bold, col);
    lines.forEach((l, k) => text(l, M + 14, y + h - 30 - k * 12.5, 9.5));
  });

  // Cierre
  y -= 20;
  page.drawRectangle({ x: M, y: y - 74, width: W - 2 * M, height: 74, color: NAVY });
  text('¿Quieres saber dónde pierde dinero tu empresa?', M + 16, y - 24, 12, bold, rgb(1, 1, 1));
  text('Agenda una sesión gratuita de 30 minutos conmigo, por videollamada o tomando un café en La Mancha.', M + 16, y - 40, 9, font, rgb(0.9, 0.94, 0.98));
  text('calendly.com/pprensas  ·  +34 659 681 684  ·  levantalamancha@levanta.email', M + 16, y - 58, 9.5, bold, rgb(0.53, 0.79, 0.29));
  text('Pablo Prensa · Fundador de LEVANTA · levanta-lamancha.es', M, 28, 8, font, GREY);

  return Buffer.from(await doc.save());
}
