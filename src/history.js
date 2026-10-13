import { PAY, payAbi, publicClient } from './chain.js';
import { mergeLocal, loadInvoices } from './lib.js';

// Best-effort: the app still works with only this device's saved copy if the server is not set up.
async function call(acct, path, init = {}) {
  const token = await acct.getAccessToken();
  const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

// Tell the server about something that just happened, so it shows on the person's other devices.
// A failed post is kept and retried on the next sync, so an X payment still reaches the recipient's Pending list.
// The server stores each item once, so sending the same one twice is safe.
const outKey = (a) => `fabrika.outbox.${String(a).toLowerCase()}`;
const readOut = (a) => { try { return JSON.parse(localStorage.getItem(outKey(a)) || '[]'); } catch { return []; } };
const writeOut = (a, list) => { try { localStorage.setItem(outKey(a), JSON.stringify(list.slice(-30))); } catch { /* storage full or blocked */ } };

export async function pushHistory(acct, body) {
  try { await call(acct, '/api/history', { method: 'POST', body: JSON.stringify(body) }); }
  catch (e) {
    // A 4xx answer will not change on retry. Anything else (offline, 5xx, 429) is kept.
    const code = Number(e?.message);
    if (code >= 400 && code < 500 && code !== 429) return;
    if (acct.address) writeOut(acct.address, [...readOut(acct.address), { body, at: Date.now() }]);
  }
}

async function flushOutbox(acct) {
  const list = readOut(acct.address);
  if (!list.length) return;
  const keep = [];
  for (const it of list) {
    if (Date.now() - it.at > 7 * 86400000) continue;
    try { await call(acct, '/api/history', { method: 'POST', body: JSON.stringify(it.body) }); }
    catch (e) {
      const code = Number(e?.message);
      if (!(code >= 400 && code < 500 && code !== 429)) keep.push(it);
    }
  }
  writeOut(acct.address, keep);
}

// Pull this wallet's history from the server into this device. Returns how many items were new.
export async function syncHistory(acct) {
  const addr = acct.address;
  if (!addr) return 0;
  await flushOutbox(acct).catch(() => {});
  try {
    const h = await call(acct, `/api/history?address=${addr}`);
    let added = 0;
    added += mergeLocal(addr, 'batches', h.payments || []);
    added += mergeLocal(addr, 'transfers', h.transfers || []);

    // Invoices are stored as ids only. The amount and note are read from the chain, so nothing is taken on trust.
    const known = new Set(loadInvoices(addr).map((i) => i.id));
    const need = (h.invoices || []).filter((i) => !known.has(i.id));
    if (need.length && PAY) {
      const rows = await Promise.all(need.map(async (i) => {
        try {
          const [r, note] = await Promise.all([
            publicClient.readContract({ address: PAY, abi: payAbi, functionName: 'getRequest', args: [i.id] }),
            publicClient.readContract({ address: PAY, abi: payAbi, functionName: 'noteOf', args: [i.id] }),
          ]);
          return { id: i.id, hash: '', amount: r[1].toString(), note, createdAt: i.at, expiresAt: Number(r[2]) };
        } catch { return null; }
      }));
      added += mergeLocal(addr, 'invoices', rows.filter(Boolean));
    }
    return added;
  } catch { return 0; }
}

// Name a transaction (shows in Account > Wallet activity). Saved on this device and, best-effort, on the server.
export async function saveLabel(acct, addr, key, name) {
  const n = String(name || '').trim().slice(0, 80);
  if (!n || !addr) return;
  const k = String(key).toLowerCase();
  try {
    const lk = `fabrika.labels.${String(addr).toLowerCase()}`;
    const m = JSON.parse(localStorage.getItem(lk) || '{}');
    m[k] = n;
    localStorage.setItem(lk, JSON.stringify(m));
  } catch { /* storage full or blocked */ }
  try { await call(acct, '/api/labels', { method: 'POST', body: JSON.stringify({ address: addr, key: k, name: n }) }); } catch { /* local copy still works */ }
}
