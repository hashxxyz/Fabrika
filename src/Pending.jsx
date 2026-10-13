import { useCallback, useEffect, useRef, useState } from 'react';
import { fmtMon, fmtDate, shortAddr, cleanError } from './lib.js';
import { Badge } from './ui.jsx';
import { Link } from './router.jsx';
import { receiptPath } from './Receipt.jsx';

// "Pending to claim": payments sent to the X account linked to this person. Shows up by itself after sign in.
// prompt = also show a "Link your X account" card when no X account is linked yet (used on the Account page).
export default function Pending({ acct, toast, prompt = false }) {
  const [state, setState] = useState(null); // { linked, x, items }
  const [claimed, setClaimed] = useState([]); // claimed in this visit: { id, amount, tx }
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  // acct is a new object on every App render; read the token getter through a ref so load() stays stable.
  const tokenRef = useRef(acct.getAccessToken);
  tokenRef.current = acct.getAccessToken;
  const call = useCallback(async (path, init = {}) => {
    const token = await tokenRef.current();
    const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` } });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.message || 'Request failed. Try again.');
    return j;
  }, []);

  const load = useCallback(async () => {
    if (!acct.authenticated || !acct.address) return;
    try { setState(await call('/api/pending')); } catch { /* service not set up: show nothing */ }
  }, [acct.authenticated, acct.address, call]);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 60000);
    return () => clearInterval(t);
  }, [load]);

  async function linkX() {
    setErr(''); setBusy('link');
    try { await acct.linkTwitter(); await new Promise((r) => setTimeout(r, 800)); await load(); } catch (e) { setErr(cleanError(e)); } finally { setBusy(''); }
  }

  async function claim(it) {
    setErr(''); setBusy(it.id);
    try {
      const j = await call('/api/claim', { method: 'POST', body: JSON.stringify({ allocationId: it.id, destination: acct.address, kind: 'x' }) });
      setClaimed((c) => [...c, { id: it.id, amount: it.amount, tx: j.txHash }]);
      toast?.('Claimed. The money is in your wallet.');
      acct.refresh?.();
      await load();
    } catch (e) { setErr(cleanError(e)); } finally { setBusy(''); }
  }

  if (!acct.authenticated || !state) return null;

  if (!state.linked) {
    if (!prompt) return null;
    return (
      <div className="card">
        <div className="card-head"><h3>Money waiting on X?</h3></div>
        <p className="note" style={{ margin: 0 }}>Link your X account and any payment sent to your handle shows up here, ready to claim. No link needed.</p>
        <button className="btn ghost" type="button" onClick={linkX} disabled={busy === 'link' || !acct.address}>{busy === 'link' ? 'One moment…' : 'Link your X account'}</button>
        <p className="msg bad" role="alert">{err}</p>
      </div>
    );
  }

  const items = state.items.filter((it) => !claimed.some((c) => c.id === it.id));
  if (!items.length && !claimed.length) return null;

  return (
    <div className="card">
      <div className="card-head"><h3>Pending to claim</h3><Badge>{items.length}</Badge></div>
      <p className="note" style={{ margin: 0 }}>Sent to @{state.x}. Tap Claim and it goes straight to your wallet. You pay no fee.</p>
      <div>
        {items.map((it) => (
          <div className="pend-row" key={it.id}>
            <div>
              <div className="pend-amt">{fmtMon(it.amount)} <small>MON</small></div>
              <div className="pend-sub">From {shortAddr(it.sender)} · expires {fmtDate(it.expiresAt)}</div>
            </div>
            <button className="btn sm" type="button" onClick={() => claim(it)} disabled={!!busy}>{busy === it.id ? 'Claiming…' : 'Claim'}</button>
          </div>
        ))}
        {claimed.map((c) => (
          <div className="pend-row" key={c.id}>
            <div>
              <div className="pend-amt">{fmtMon(c.amount)} <small>MON</small></div>
              <div className="pend-sub">Claimed{c.tx ? <> · <Link to={receiptPath(c.tx)}>View receipt</Link></> : ''}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="msg bad" role="alert">{err}</p>
    </div>
  );
}
