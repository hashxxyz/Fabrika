import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { explorer } from './chain.js';
import { fmtMon, fmtDate, shortAddr, cleanError, loadTransfers } from './lib.js';
import { copyText } from './ui.jsx';
import { Link } from './router.jsx';
import { receiptPath } from './Receipt.jsx';

// Everything that moved MON in or out of this wallet, including transactions made in other apps (Trust Wallet, MetaMask...).
// Names are saved per address ("Mum") or per transaction ("Rent, May"), on the server and cached on this device.
// If the server is not set up, the list falls back to the payments made from this device.
const lkey = (a) => `fabrika.labels.${String(a).toLowerCase()}`;
const loadLocal = (a) => { try { return JSON.parse(localStorage.getItem(lkey(a)) || '{}'); } catch { return {}; } };
const saveLocal = (a, l) => { try { localStorage.setItem(lkey(a), JSON.stringify(l)); } catch { /* storage full or blocked */ } };

const svg = (d) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const ICON = {
  in: svg(<path d="M17 7L7 17M7 9v8h8" />),
  out: svg(<path d="M7 17L17 7M9 7h8v8" />),
  self: svg(<path d="M7 8h10l-3-3M17 16H7l3 3" />),
  failed: svg(<path d="M6 6l12 12M18 6L6 18" />),
  refresh: svg(<path d="M20 12a8 8 0 11-2.4-5.7M20 4v5h-5" />),
};

const FILTERS = [['all', 'All'], ['in', 'Received'], ['out', 'Sent']];
const WORD = { in: 'Received', out: 'Sent', self: 'To self' };

const sameDay = (a, b) => a.toDateString() === b.toDateString();
const dayKey = (sec) => (sec ? new Date(sec * 1000).toDateString() : 'earlier');
function dayLabel(sec) {
  if (!sec) return 'Earlier';
  const d = new Date(sec * 1000);
  const now = new Date();
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return 'Today';
  if (sameDay(d, yest)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}
const timeOf = (sec) => (sec ? new Date(sec * 1000).toLocaleTimeString(undefined, { timeStyle: 'short' }) : '');

export default function Activity({ acct, toast }) {
  const [items, setItems] = useState(null);
  const [labels, setLabels] = useState(() => loadLocal(acct.address));
  const [off, setOff] = useState(false); // server not set up: use this device's payments
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState('');   // row id that is expanded
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
      setOff(false);
      setLabels((cur) => { const m = { ...cur, ...(l.labels || {}) }; saveLocal(addr, m); return m; });
    } catch (e) {
      if (e.status === 404 || /not set up/i.test(e.message)) setOff(true);
      else setErr(cleanError(e));
    } finally { setLoading(false); }
  }, [addr, call]);

  useEffect(() => { load(); }, [load]);

  async function save(row) {
    const name = draft.trim().slice(0, 80);
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
    if (r.note) return { text: r.note, custom: false };
    return { text: r.cp ? shortAddr(r.cp) : 'Contract', custom: false };
  };

  // Payments made from this device, shaped like the server's rows.
  const localRows = useMemo(() => loadTransfers(addr).map((t) => ({
    id: t.hash, hash: t.hash, at: Math.floor(Number(t.at) / 1000), dir: 'out', cp: t.to, value: String(t.amount), failed: false, app: '', note: t.note || '', local: true,
  })).sort((a, b) => b.at - a.at), [addr, off, err]);
  const receipts = useMemo(() => new Set(loadTransfers(addr).map((t) => String(t.hash).toLowerCase())), [addr, items]);

  const rows = items || (off || err ? localRows : null);
  const shown = useMemo(() => (rows || []).filter((r) => filter === 'all' || r.dir === filter), [rows, filter]);
  const totals = useMemo(() => {
    let inn = 0n, out = 0n;
    (rows || []).forEach((r) => {
      if (r.failed) return;
      if (r.dir === 'in') inn += BigInt(r.value);
      else if (r.dir === 'out') out += BigInt(r.value);
    });
    return { inn, out };
  }, [rows]);
  const groups = useMemo(() => {
    const out = [];
    shown.forEach((r) => {
      const k = dayKey(r.at);
      const last = out[out.length - 1];
      if (last && last.k === k) last.rows.push(r);
      else out.push({ k, label: dayLabel(r.at), rows: [r] });
    });
    return out;
  }, [shown]);

  const waiting = !rows && !err && !off;

  return (
    <div className="embed">
      {rows && rows.length > 0 && (
        <div className="hstats">
          <div className="hstat" data-dir="in"><span>Received</span><b>+{fmtMon(totals.inn)} MON</b></div>
          <div className="hstat"><span>Sent</span><b>−{fmtMon(totals.out)} MON</b></div>
        </div>
      )}
      <div className="htool">
        <div className="seg" role="tablist" aria-label="Filter activity">
          {FILTERS.map(([v, l]) => <button key={v} type="button" role="tab" aria-selected={filter === v} onClick={() => setFilter(v)}>{l}</button>)}
        </div>
        <button className="hrefresh" type="button" onClick={load} disabled={loading} aria-label="Refresh activity" title="Refresh" data-busy={loading ? '1' : '0'}>{ICON.refresh}</button>
      </div>

      {err && <p className="msg bad" role="alert">{err}{rows && rows.length ? ' Showing payments made from this device.' : ''}</p>}
      {off && <p className="note" style={{ margin: 0 }}>Full wallet history is not switched on, so this shows payments made from this device.</p>}

      {waiting && (
        <div aria-busy="true" aria-label="Loading activity">
          {[0, 1, 2, 3].map((i) => <div className="hsk" key={i}><i /><i /><i /></div>)}
        </div>
      )}

      {rows && !rows.length && !err && (
        <div className="hempty">
          <b>No transfers yet</b>
          <span className="note" style={{ margin: 0 }}>Money you send or receive in MON shows up here, including from other wallet apps.</span>
          <Link className="btn ghost sm" to="/transfer" style={{ width: 'auto' }}>Send money</Link>
        </div>
      )}
      {rows && rows.length > 0 && !shown.length && <p className="note" style={{ margin: 0 }}>Nothing {filter === 'in' ? 'received' : 'sent'} in this list.</p>}

      {groups.map((g) => (
        <section className="hgroup" key={g.k}>
          <h4>{g.label}</h4>
          <ul className="hlist">
            {g.rows.map((r) => {
              const n = nameOf(r);
              const isOpen = open === r.id;
              const kind = r.failed ? 'failed' : r.dir;
              const sign = r.dir === 'in' ? '+' : r.dir === 'out' ? '−' : '';
              const word = r.failed ? 'Failed' : WORD[r.dir];
              return (
                <li className="hrow" key={r.id}>
                  <button className="hrow-main" type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? '' : r.id)}>
                    <span className="hico" data-k={kind}>{ICON[kind]}</span>
                    <span className="hmid">
                      <span className="hname">{n.text}</span>
                      <span className="hsub" data-failed={r.failed ? '1' : '0'}>{word}{r.at ? ` · ${timeOf(r.at)}` : ''}</span>
                    </span>
                    <span className="hamt" data-dir={r.failed ? 'failed' : r.dir}>{sign}{fmtMon(BigInt(r.value))}<small>MON</small></span>
                  </button>
                  {isOpen && (
                    <div className="hmore">
                      <dl className="hdl">
                        <div><dt>When</dt><dd>{r.at ? fmtDate(r.at) : 'Unknown'}</dd></div>
                        {r.cp && <div><dt>{r.dir === 'in' ? 'From' : 'To'}</dt><dd>{shortAddr(r.cp)} <button className="copy" type="button" onClick={() => copyText(r.cp, toast)}>Copy</button></dd></div>}
                        <div><dt>Status</dt><dd>{r.failed ? 'Failed' : 'Confirmed'}</dd></div>
                      </dl>
                      {editing === r.id ? (
                        <div className="field">
                          <input
                            value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={80} autoFocus
                            placeholder={r.cp ? `Name for ${shortAddr(r.cp)}` : 'Name this transaction'} aria-label="Name"
                            onKeyDown={(e) => { if (e.key === 'Enter') save(r); if (e.key === 'Escape') setEditing(''); }}
                          />
                          {r.cp && (
                            <label className="check">
                              <input type="checkbox" checked={onlyTx} onChange={(e) => setOnlyTx(e.target.checked)} /> Only this transaction
                            </label>
                          )}
                          <div className="actions">
                            <button className="btn sm" type="button" onClick={() => save(r)}>Save name</button>
                            <button className="btn ghost sm" type="button" onClick={() => setEditing('')}>Cancel</button>
                          </div>
                          {!onlyTx && r.cp && <p className="note" style={{ margin: 0 }}>This name shows on every payment with {shortAddr(r.cp)}. Leave it empty to remove it.</p>}
                        </div>
                      ) : (
                        <div className="hacts">
                          <a className="btn ghost sm" href={explorer.tx(r.hash)} target="_blank" rel="noopener">View on explorer</a>
                          {receipts.has(String(r.hash).toLowerCase()) && <Link className="btn ghost sm" to={receiptPath(r.hash)}>Receipt</Link>}
                          <button className="btn ghost sm" type="button" onClick={() => startEdit(r, n)}>{n.custom ? 'Rename' : 'Add a name'}</button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {rows && rows.length > 0 && <p className="note" style={{ margin: 0 }}>Totals cover the {rows.length} most recent transfers. Tap one to name it or see details.</p>}
    </div>
  );
}
