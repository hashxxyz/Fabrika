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
export async function pushHistory(acct, body) {
  try { await call(acct, '/api/history', { method: 'POST', body: JSON.stringify(body) }); } catch { /* local copy still works */ }
}

// Pull this wallet's history from the server into this device. Returns how many items were new.
export async function syncHistory(acct) {
  const addr = acct.address;
  if (!addr) return 0;
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
