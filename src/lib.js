import { keccak256, toBytes, toHex, parseEther, formatEther } from 'viem';

// The backend must use the same rule: trim, drop leading @, lowercase, keccak256 of the UTF-8 bytes.
// Telegram tags are the plain hash (unchanged, so old payouts still work). X tags are namespaced with "x:"
// so the same name on both platforms can never match the wrong person. Telegram names cannot contain ":".
export const normalizeHandle = (s) => String(s || '').trim().replace(/^@+/, '').toLowerCase();
export const KINDS = {
  telegram: { label: 'Telegram', re: /^[a-z][a-z0-9_]{4,31}$/, hint: 'a Telegram username' },
  x: { label: 'X', re: /^[a-z0-9_]{1,15}$/, hint: 'an X username' },
};
export const HANDLE_RE = KINDS.telegram.re;
export const tagOf = (handle, kind = 'telegram') => {
  const h = normalizeHandle(handle);
  return keccak256(toBytes(kind === 'x' ? `x:${h}` : h));
};
export const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
export const randomId = () => toHex(crypto.getRandomValues(new Uint8Array(32)));

export function parseAmount(s) {
  let t = String(s ?? '').trim();
  // A single comma is a decimal comma ("1,5"). "1,000" is ambiguous, so reject it instead of reading it as 1.
  if (t.includes(',')) {
    if (t.includes('.') || !/^\d{1,9},\d{1,2}$|^\d{1,9},\d{4,6}$/.test(t)) return null;
    t = t.replace(',', '.');
  }
  if (!/^\d{1,9}(\.\d{1,6})?$/.test(t)) return null;
  const w = parseEther(t);
  return w > 0n ? w : null;
}

// One recipient per line: "@username 2.5"
export function parseLines(text, kind = 'telegram') {
  const k = KINDS[kind] || KINDS.telegram;
  const rows = [], errors = [], seen = new Set();
  String(text || '').split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const m = line.match(/^@?([A-Za-z0-9_]+)[\s,:=]+([\d.,]+)$/);
    if (!m) { errors.push(`Line ${i + 1}: use "@name amount"`); return; }
    const handle = normalizeHandle(m[1]);
    const amount = parseAmount(m[2]);
    if (!k.re.test(handle)) { errors.push(`Line ${i + 1}: @${handle} is not a valid ${k.label} username`); return; }
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
export const cleanNote = (s, max = 80) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
export const claimUrl = (allocationId, kind = 'telegram', note = '') => {
  const n = cleanNote(note);
  return `${location.origin}/claim?a=${allocationId}${kind === 'x' ? '&k=x' : ''}${n ? `&n=${encodeURIComponent(n)}` : ''}`;
};
export const fmtDate = (sec) => new Date(Number(sec) * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const key = (addr) => `fabrika.batches.${String(addr).toLowerCase()}`;
export const loadBatches = (addr) => { try { return JSON.parse(localStorage.getItem(key(addr)) || '[]'); } catch { return []; } };
export const saveBatch = (addr, b) => {
  try { localStorage.setItem(key(addr), JSON.stringify([b, ...loadBatches(addr).filter((x) => x.batchId !== b.batchId)].slice(0, 50))); } catch { /* storage full or blocked */ }
};
export const removeBatch = (addr, batchId) => {
  try { localStorage.setItem(key(addr), JSON.stringify(loadBatches(addr).filter((x) => x.batchId !== batchId))); } catch { /* ignore */ }
};

// Ask again until fn() returns true, up to `tries` times. Used after Privy links an account, where the server needs a moment to see it.
export async function pollUntil(fn, { tries = 6, ms = 800 } = {}) {
  for (let i = 0; i < tries; i++) {
    try { if (await fn()) return true; } catch { /* try again */ }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, ms));
  }
  return false;
}

export function cleanError(e) {
  const m = String(e?.shortMessage || e?.message || e || 'Something went wrong');
  const rejected = e?.name === 'UserRejectedRequestError' || e?.code === 4001 || e?.cause?.code === 4001 || /user rejected|user denied|rejected the request/i.test(m);
  if (rejected) return 'You cancelled the request.';
  if (/insufficient funds/i.test(m)) return 'Not enough MON in your wallet for this amount plus the network fee.';
  return m.length > 200 ? m.slice(0, 200) + '…' : m;
}

// Direct wallet transfers (no vault): kept on this device so they show up on the Account page.
const tkey = (addr) => `fabrika.transfers.${String(addr).toLowerCase()}`;
export const loadTransfers = (addr) => { try { return JSON.parse(localStorage.getItem(tkey(addr)) || '[]'); } catch { return []; } };
export const saveTransfer = (addr, t) => {
  try { localStorage.setItem(tkey(addr), JSON.stringify([t, ...loadTransfers(addr)].slice(0, 50))); } catch { /* storage full or blocked */ }
};
// Invoices created on this device.
const ikey = (addr) => `fabrika.invoices.${String(addr).toLowerCase()}`;
export const loadInvoices = (addr) => { try { return JSON.parse(localStorage.getItem(ikey(addr)) || '[]'); } catch { return []; } };
export const saveInvoice = (addr, inv) => {
  try { localStorage.setItem(ikey(addr), JSON.stringify([inv, ...loadInvoices(addr)].slice(0, 50))); } catch { /* storage full or blocked */ }
};
export const payUrl = (id) => `${location.origin}/pay?i=${id}`;
export const clearLocalData = (addr) => {
  try { localStorage.removeItem(key(addr)); localStorage.removeItem(tkey(addr)); localStorage.removeItem(ikey(addr)); } catch { /* ignore */ }
};

// Newest-first mix of payouts and direct transfers for the Home and Account pages.
export function recentActivity(addr, limit = 5) {
  const pay = loadBatches(addr).flatMap((b) => b.items.map((it) => ({
    key: it.id, title: `@${it.handle}`, tag: (KINDS[it.kind || 'telegram'] || KINDS.telegram).label, amount: BigInt(it.amount), at: b.createdAt,
  })));
  const tr = loadTransfers(addr).map((t) => ({ key: t.hash, title: shortAddr(t.to), tag: 'Wallet', amount: BigInt(t.amount), at: t.at }));
  const inv = loadInvoices(addr).map((i) => ({ key: i.id, title: i.note || 'Invoice', tag: 'Invoice', amount: BigInt(i.amount), at: i.createdAt }));
  return [...pay, ...tr, ...inv].sort((a, b) => b.at - a.at).slice(0, limit);
}

// Merge items fetched from the server into this device's list. Returns how many were new.
export function mergeLocal(addr, what, items) {
  const cfg = {
    batches: { key: key(addr), id: (x) => x.batchId, at: (x) => x.createdAt, load: loadBatches },
    transfers: { key: tkey(addr), id: (x) => x.hash, at: (x) => x.at, load: loadTransfers },
    invoices: { key: ikey(addr), id: (x) => x.id, at: (x) => x.createdAt, load: loadInvoices },
  }[what];
  const have = cfg.load(addr);
  const seen = new Set(have.map(cfg.id));
  const fresh = items.filter((x) => x && !seen.has(cfg.id(x)));
  if (!fresh.length) return 0;
  const all = [...have, ...fresh].sort((a, b) => cfg.at(b) - cfg.at(a)).slice(0, 50);
  try { localStorage.setItem(cfg.key, JSON.stringify(all)); } catch { /* storage full or blocked */ }
  return fresh.length;
}
