import { formatEther } from 'viem';
import { parseAmount } from './lib.js';

// Rich invoice details live in the pay link and on this device. The chain only holds the total and a short note.
// The pay page recomputes the total from the details and shows them only if it equals the on-chain amount.

const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, max);
const cleanMulti = (s, max) => String(s ?? '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, max);
export const MAX_ITEMS = 20;

// items: [{ d: description, q: integer qty, p: wei bigint }]
export function totals(items, taxBps = 0, discount = 0n) {
  const sub = items.reduce((a, i) => a + BigInt(i.q) * BigInt(i.p), 0n);
  const disc = discount > sub ? sub : discount;
  const base = sub - disc;
  const tax = (base * BigInt(taxBps)) / 10000n;
  return { sub, disc, tax, total: base + tax };
}

export const parseQty = (s) => (/^\d{1,6}$/.test(String(s).trim()) && Number(s) > 0 ? Number(s) : null);
export function parseTaxBps(s) {
  const t = String(s ?? '').trim();
  if (!t) return 0;
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(t)) return null;
  const bps = Math.round(parseFloat(t) * 100);
  return bps <= 5000 ? bps : null;
}

export const makeDetails = ({ biz, name, email, items, taxBps, discount, notes, issued }) => ({
  b: clean(biz, 60), c: clean(name, 60), e: clean(email, 80),
  t: items.map((i) => [clean(i.d, 80), i.q, i.p.toString()]),
  x: taxBps || 0, v: discount ? discount.toString() : '0', m: cleanMulti(notes, 300), s: issued,
});

const b64 = {
  enc: (str) => btoa(String.fromCharCode(...new TextEncoder().encode(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))),
};
export const encodeDetails = (d) => b64.enc(JSON.stringify(d));

// Returns a sanitized details object, or null if missing or malformed.
export function decodeDetails(s) {
  if (!s || s.length > 8000) return null;
  try {
    const o = JSON.parse(b64.dec(s));
    if (!Array.isArray(o.t) || !o.t.length || o.t.length > MAX_ITEMS) return null;
    const t = o.t.map((r) => {
      const q = Number(r[1]);
      if (!Number.isInteger(q) || q < 1 || q > 999999 || !/^\d{1,30}$/.test(String(r[2]))) throw new Error('bad item');
      return [clean(r[0], 80), q, String(r[2])];
    });
    const x = Number(o.x) || 0;
    if (!Number.isInteger(x) || x < 0 || x > 5000) return null;
    if (!/^\d{1,30}$/.test(String(o.v ?? '0'))) return null;
    return { b: clean(o.b, 60), c: clean(o.c, 60), e: clean(o.e, 80), t, x, v: String(o.v ?? '0'), m: cleanMulti(o.m, 300), s: Number(o.s) || 0 };
  } catch { return null; }
}

export const detailItems = (d) => d.t.map(([desc, q, p]) => ({ d: desc, q, p: BigInt(p) }));
export const detailTotals = (d) => totals(detailItems(d), d.x, BigInt(d.v || '0'));

// Short on-chain note: first item plus a count, capped at 120 bytes.
export function chainNote(items) {
  const first = items[0]?.d || 'Invoice';
  const extra = items.length > 1 ? ` +${items.length - 1} more` : '';
  let s = `${first}${extra}`;
  while (new TextEncoder().encode(s).length > 120) s = s.slice(0, -1);
  return s;
}

const BIZ_KEY = 'fabrika.biz';
export const loadBiz = () => { try { return JSON.parse(localStorage.getItem(BIZ_KEY) || '{}'); } catch { return {}; } };
export const saveBiz = (b) => { try { localStorage.setItem(BIZ_KEY, JSON.stringify(b)); } catch { /* storage blocked */ } };

export const payLink = (id, d) => `${location.origin}/pay?i=${id}${d ? `&d=${encodeDetails(d)}` : ''}`;
export const money = (wei) => `${Number(formatEther(BigInt(wei))).toLocaleString(undefined, { maximumFractionDigits: 6 })} MON`;
export { parseAmount };
