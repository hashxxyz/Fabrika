// Draws a Fabrika receipt as a PNG with the plain canvas API (no extra packages).
import { fmtMon } from './lib.js';

const W = 1080, PAD = 72;
const FONT = '"Hanken Grotesk","Avenir Next","Segoe UI",system-ui,sans-serif';

function fit(ctx, text, maxW) {
  let t = String(text ?? '');
  if (ctx.measureText(t).width <= maxW) return t;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}

export async function receiptCanvas({ title, amount, ok = true, rows = [], hash, took }) {
  try { await document.fonts?.ready; } catch { /* fall back to system font */ }
  const list = rows.filter(Boolean).map(([k, v]) => [String(k), String(v ?? '')]);
  const HEAD = 520, ROW = 92, FOOT = 190;
  const H = HEAD + list.length * ROW + FOOT;
  const scale = 1;
  const c = document.createElement('canvas');
  c.width = W * scale; c.height = H * scale;
  const ctx = c.getContext('2d');

  // paper
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);

  // Monad purple header
  const g = ctx.createLinearGradient(0, 0, W, HEAD);
  g.addColorStop(0, ok ? '#8C77FA' : '#B3361F'); g.addColorStop(0.55, ok ? '#6A52EE' : '#9C2E1B'); g.addColorStop(1, ok ? '#5238D8' : '#7F2415');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, HEAD);

  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 34px ${FONT}`; ctx.textAlign = 'left';
  ctx.fillText('FABRIKA RECEIPT', PAD, 110);
  ctx.textAlign = 'right'; ctx.globalAlpha = 0.85; ctx.font = `500 30px ${FONT}`;
  ctx.fillText(`No. ${hash ? hash.slice(2, 10).toUpperCase() : '—'}`, W - PAD, 110);
  ctx.globalAlpha = 1; ctx.textAlign = 'left';

  // check / cross badge
  ctx.beginPath(); ctx.arc(PAD + 44, 218, 44, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fill();
  ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  if (ok) { ctx.moveTo(PAD + 22, 220); ctx.lineTo(PAD + 38, 237); ctx.lineTo(PAD + 68, 200); }
  else { ctx.moveTo(PAD + 26, 200); ctx.lineTo(PAD + 62, 236); ctx.moveTo(PAD + 62, 200); ctx.lineTo(PAD + 26, 236); }
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF'; ctx.font = `500 52px ${FONT}`;
  ctx.fillText(fit(ctx, title, W - PAD * 2 - 130), PAD + 118, 236);

  if (amount != null) {
    const n = fmtMon(amount, 6);
    ctx.font = `300 132px ${FONT}`;
    const nW = ctx.measureText(n).width;
    ctx.fillText(n, PAD, 400);
    ctx.font = `400 44px ${FONT}`; ctx.globalAlpha = 0.85;
    ctx.fillText('MON', PAD + nW + 20, 400); ctx.globalAlpha = 1;
  }
  ctx.font = `400 32px ${FONT}`; ctx.globalAlpha = 0.9;
  ctx.fillText(ok ? (took ? `Confirmed in ${took}s on Monad` : 'Confirmed on Monad') : 'This transaction failed', PAD, 468);
  ctx.globalAlpha = 1;

  // tear line
  ctx.strokeStyle = '#B9B4D9'; ctx.lineWidth = 3; ctx.setLineDash([14, 14]);
  ctx.beginPath(); ctx.moveTo(PAD, HEAD + 44); ctx.lineTo(W - PAD, HEAD + 44); ctx.stroke(); ctx.setLineDash([]);

  // rows
  let y = HEAD + 44;
  list.forEach(([k, v], i) => {
    y += ROW;
    ctx.textAlign = 'left'; ctx.fillStyle = '#5F636A'; ctx.font = `400 34px ${FONT}`;
    ctx.fillText(k, PAD, y - 30);
    ctx.textAlign = 'right'; ctx.fillStyle = '#0B0C0E'; ctx.font = `500 36px ${FONT}`;
    ctx.fillText(fit(ctx, v, W - PAD * 2 - 260), W - PAD, y - 30);
    if (i < list.length - 1) { ctx.strokeStyle = '#ECEAF7'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke(); }
  });

  // footer
  ctx.textAlign = 'left'; ctx.fillStyle = '#5238D8'; ctx.font = `600 32px ${FONT}`;
  ctx.fillText('Monad Testnet', PAD, H - 96);
  ctx.fillStyle = '#5F636A'; ctx.font = `400 28px ${FONT}`;
  if (hash) ctx.fillText(`${hash.slice(0, 10)}…${hash.slice(-8)}`, PAD, H - 50);
  ctx.textAlign = 'right'; ctx.fillStyle = '#836EF9'; ctx.font = `600 34px ${FONT}`;
  ctx.fillText('Fabrika', W - PAD, H - 50);
  return c;
}

const toBlob = (canvas) => new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not make the image'))), 'image/png'));
export const receiptBlob = async (data) => toBlob(await receiptCanvas(data));
export const receiptFileName = (hash) => `fabrika-receipt-${hash ? hash.slice(2, 10) : Date.now()}.png`;

export async function downloadReceipt(data) {
  const blob = await receiptBlob(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = receiptFileName(data.hash);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Returns 'copied' | 'shared' | 'downloaded'. Copies the image to the clipboard when the browser allows it.
export async function copyReceiptImage(data) {
  if (navigator.clipboard?.write && window.ClipboardItem) {
    // Safari needs the blob promise handed over right inside the tap, so pass the promise itself.
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': receiptBlob(data) })]);
    return 'copied';
  }
  const blob = await receiptBlob(data);
  const file = new File([blob], receiptFileName(data.hash), { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }); return 'shared'; }
  await downloadReceipt(data);
  return 'downloaded';
}
