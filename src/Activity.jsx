import { useCallback, useEffect, useRef, useState } from 'react';
import { formatEther } from 'viem';
import { explorer } from './chain.js';
import { fmtMon, fmtDate, shortAddr, cleanError } from './lib.js';

// Everything that moved MON in or out of this wallet, including transactions made in other apps (Trust Wallet, MetaMask...).
// Names are saved per address ("Mum") or per transaction ("Rent, May"), on the server and cached on this device.
const lkey = (a) => `fabrika.labels.${String(a).toLowerCase()}`;
const loadLocal = (a) => { try { return JSON.parse(localStorage.getItem(lkey(a)) || '{}'); } catch { return {}; } };
const saveLocal = (a, l) => { try { localStorage.setItem(lkey(a), JSON.stringify(l)); } catch { /* storage full or blocked */ } };

export default function Activity({ acct, toast }) {
  const [items, setItems] = useState(null);
  const [labels, setLabels] = useState(() => loadLocal(acct.address));
  const [off, setOff] = useState(false); // server not set up: show nothing
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(''); // row id being named
  const [draft, setDraft] = useState('');
  const [onlyTx, setOnlyTx] = useState(false);

  // acct is a new object every App render; read the token getter through a ref so load() stays stable.
  const tokenRef = useRef(acct.getAccessToken);
  tokenRef.current = acct.getAccessToken;
  const call = useCallback(async (path, init = {}) => {
    const token = await tokenRef.current();
    const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` } });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(j.message || 'Request failed. Try again.'); e.status = res.status; throw e; }
    return j;
  }, []);

  const addr = acct.address;
  const load = useCallback(async () => {
    if (!addr) return;
    setLoading(true); setErr('');
    try {
      const [a, l] = await Promise.all([
        call(`/api/activity?address=${addr}`),
        call(`/api/labels?address=${addr}`).catch(() => ({ labels: {} })),
      ]);
      setItems(a.items || []);
      setLabels((cur) => { const m = { ...cur, ...(l.labels || {}) }; saveLocal(addr, m); return m; });
    } catch (e) {
      if (e.status === 404 || /not set up/i.test(e.message)) setOff(true);
      else setErr(cleanError(e));
    } finally { setLoading(false); }
  }, [addr, call]);

  useEffect(() => { load(); }, [load]);

  async function save(row) {
    const name = draft.trim().slice(0, 40);
    const key = onlyTx ? `tx:${row.hash}` : row.cp ? `addr:${row.cp}` : `tx:${row.hash}`;
    setLabels((cur) => {
      const m = { ...cur };
      if (name) m[key] = name; else delete m[key];
      saveLocal(addr, m);
      return m;
    });
    setEditing('');
    try { await call('/api/labels', { method: 'POST', body: JSON.stringify({ address: addr, key, name }) }); }
    catch { toast?.('Saved on this device only'); }
  }

  function startEdit(row, shown) {
    setEditing(row.id); setDraft(shown.custom ? shown.text : ''); setOnlyTx(false);
  }

  const nameOf = (r) => {
    const t = labels[`tx:${r.hash}`] || (r.cp && labels[`addr:${r.cp}`]);
    if (t) return { text: t, custom: true };
    if (r.app) return { text: r.app, custom: false };
    return { text: r.cp ? shortAddr(r.cp) : 'Contract', custom: false };
  };

  if (off || (!items && !err && !loading)) return null;

  return (
    <div className="card">
      <div className="card-head">
        <h3>Wallet activity</h3>
        <button className="copy" type="button" onClick={load} disabled={loading}>{loading ? 'Checking…' : 'Refresh'}</button>
      </div>
      <p className="note" style={{ margin: 0 }}>Everything sent or received by this wallet, including from other apps. Tap Name to label a person or payment.</p>
      {err && <p className="msg bad" role="alert">{err}</p>}
      {items && !items.length && !err && <p className="note" style={{ margin: 0 }}>No MON transfers found for this wallet yet.</p>}
      <div>
        {(items || []).map((r) => {
          const n = nameOf(r);
          const sign = r.dir === 'in' ? '+' : r.dir === 'out' ? '−' : '';
          return (
            <div className="act" key={r.id}>
              <span className="t">
                {n.text}{' '}
                <em className="tag">{r.failed ? 'Failed' : r.dir === 'in' ? 'Received' : r.dir === 'out' ? 'Sent' : 'To self'}</em>
              </span>
              <span className="a">{sign}{fmtMon(BigInt(r.value))} MON</span>
              <span className="s">
                {r.at ? fmtDate(r.at) : ''} · <a href={explorer.tx(r.hash)} target="_blank" rel="noopener">View</a> ·{' '}
                <button className="copy" type="button" onClick={() => startEdit(r, n)}>Name</button>
              </span>
              {editing === r.id && (
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <input
                    value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={40} autoFocus
                    placeholder={r.cp ? `Name for ${shortAddr(r.cp)}` : 'Name this transaction'} aria-label="Name"
                    onKeyDown={(e) => { if (e.key === 'Enter') save(r); }}
                  />
                  {r.cp && (
                    <label className="note" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="checkbox" checked={onlyTx} onChange={(e) => setOnlyTx(e.target.checked)} /> Only this transaction
                    </label>
                  )}
                  <div className="actions">
                    <button className="btn sm" type="button" onClick={() => save(r)}>Save</button>
                    <button className="btn ghost sm" type="button" onClick={() => setEditing('')}>Cancel</button>
                  </div>
                  {!onlyTx && r.cp && <p className="note" style={{ margin: 0 }}>This name shows on every payment with {shortAddr(r.cp)}. Leave it empty to remove.</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
