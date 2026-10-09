import { keccak256, toBytes, toHex, parseEther, formatEther } from 'viem';

// The backend must use the same rule: trim, drop leading @, lowercase, keccak256 of the UTF-8 bytes.
export const normalizeHandle = (s) => String(s || '').trim().replace(/^@+/, '').toLowerCase();
export const HANDLE_RE = /^[a-z][a-z0-9_]{4,31}$/;
export const tagOf = (handle) => keccak256(toBytes(normalizeHandle(handle)));
export const randomId = () => toHex(crypto.getRandomValues(new Uint8Array(32)));

export function parseAmount(s) {
  const t = String(s ?? '').trim().replace(',', '.');
  if (!/^\d{1,9}(\.\d{1,6})?$/.test(t)) return null;
  const w = parseEther(t);
  return w > 0n ? w : null;
}

// One recipient per line: "@ada 2.5" or "ada, 2.5"
export function parseLines(text) {
  const rows = [], errors = [], seen = new Set();
  String(text || '').split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const m = line.match(/^@?([A-Za-z0-9_]+)[\s,:=]+([\d.,]+)$/);
    if (!m) { errors.push(`Line ${i + 1}: use "@name amount"`); return; }
    const handle = normalizeHandle(m[1]);
    const amount = parseAmount(m[2]);
    if (!HANDLE_RE.test(handle)) { errors.push(`Line ${i + 1}: @${handle} is not a valid Telegram username`); return; }
    if (!amount) { errors.push(`Line ${i + 1}: bad amount`); return; }
    if (seen.has(handle)) { errors.push(`Line ${i + 1}: @${handle} appears twice`); return; }
    seen.add(handle);
    rows.push({ handle, amount });
  });
  return { rows, errors };
}

export const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
export const fmtMon = (wei, d = 4) => {
  const n = Number(formatEther(wei));
  return n.toLocaleString(undefined, { maximumFractionDigits: d });
};
export const claimUrl = (allocationId) => `${location.origin}/claim?a=${allocationId}`;
export const fmtDate = (sec) => new Date(Number(sec) * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const key = (addr) => `fabrika.batches.${String(addr).toLowerCase()}`;
export const loadBatches = (addr) => { try { return JSON.parse(localStorage.getItem(key(addr)) || '[]'); } catch { return []; } };
export const saveBatch = (addr, b) => {
  try { localStorage.setItem(key(addr), JSON.stringify([b, ...loadBatches(addr)].slice(0, 50))); } catch { /* storage full or blocked */ }
};

export function cleanError(e) {
  const m = String(e?.shortMessage || e?.message || e || 'Something went wrong');
  if (/user rejected|denied|cancel/i.test(m)) return 'You cancelled the request.';
  if (/insufficient funds/i.test(m)) return 'Not enough MON in your wallet for this amount plus the network fee.';
  return m.length > 200 ? m.slice(0, 200) + '…' : m;
}
