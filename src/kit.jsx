import { useCallback, useEffect, useRef, useState } from 'react';
import { publicClient } from './chain.js';
import { cleanError, ADDR_RE, shortAddr } from './lib.js';
import { copyText } from './ui.jsx';
import { Link } from './router.jsx';

export const ID_RE = /^0x[0-9a-fA-F]{64}$/;
export const param = (k) => new URLSearchParams(location.search).get(k) || '';
export const read = (address, abi, functionName, args = []) => publicClient.readContract({ address, abi, functionName, args });

export const CHECK = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
export const bytes = (s) => new TextEncoder().encode(s).length;
export const nowSec = () => Math.floor(Date.now() / 1000);

// Date inputs give "YYYY-MM-DD". We use the end of that day in the person's own time zone.
export const dayEnd = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return 0;
  const t = Math.floor(new Date(`${s}T23:59:00`).getTime() / 1000);
  return Number.isFinite(t) ? t : 0;
};
export const todayStr = (plusDays = 0) => {
  const d = new Date(Date.now() + plusDays * 86400000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// One address per line, comma or space. Returns { list, bad }.
export function parseAddresses(text) {
  const parts = String(text || '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  const list = [], bad = [];
  for (const p of parts) {
    if (ADDR_RE.test(p)) { if (!list.some((x) => x.toLowerCase() === p.toLowerCase())) list.push(p); } else bad.push(p);
  }
  return { list, bad };
}
export const same = (a, b) => !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();

// Run one wallet transaction: confirm, wait, report. Returns { hash, rc } or null (and sets err).
export function useTx(acct) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const run = async (label, fn) => {
    setErr('');
    try {
      setBusy('Confirm…');
      const wc = await acct.getClient();
      const hash = await fn(wc);
      setBusy(label || 'Working…');
      const rc = await publicClient.waitForTransactionReceipt({ hash });
      if (rc.status !== 'success') throw new Error('The transaction failed.');
      acct.refresh();
      return { hash, rc };
    } catch (e) {
      setErr(cleanError(e));
      return null;
    } finally {
      setBusy('');
    }
  };
  return { busy, err, setErr, run };
}

// Load something from the chain now, then every few seconds. `fn` runs with the latest closure.
export function useLive(fn, deps, ms = 6000) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const ref = useRef(fn);
  ref.current = fn;
  const reload = useCallback(async () => {
    try { setData(await ref.current()); setError(''); } catch { setError('Could not load this right now. Try again.'); }
  }, []);
  useEffect(() => {
    let live = true;
    const go = async () => { try { const d = await ref.current(); if (live) { setData(d); setError(''); } } catch { if (live) setError((e) => e || 'Could not load this right now. Try again.'); } };
    go();
    const t = ms ? setInterval(go, ms) : null;
    return () => { live = false; if (t) clearInterval(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, reload };
}

// Items this person made, kept on this device so the page can list them. The chain is the source of truth.
const lkey = (feature, addr) => `fabrika.f.${feature}.${String(addr).toLowerCase()}`;
export const loadMine = (feature, addr) => { try { return JSON.parse(localStorage.getItem(lkey(feature, addr)) || '[]'); } catch { return []; } };
export const saveMine = (feature, addr, item) => {
  try { localStorage.setItem(lkey(feature, addr), JSON.stringify([item, ...loadMine(feature, addr).filter((x) => x.id !== item.id)].slice(0, 30))); } catch { /* storage full or blocked */ }
};

export function NotOn({ name }) {
  return (
    <section className="col">
      <div className="card">
        <h1 className="title">{name}</h1>
        <p className="sub">This feature is not switched on yet. Deploy its contract and set its address. See contracts/DEPLOY.md.</p>
        <Link className="btn ghost" to="/explore">Back to Explore</Link>
      </div>
    </section>
  );
}

export function Share({ url, text, toast }) {
  return (
    <>
      <code className="callout" style={{ overflowWrap: 'anywhere' }}>{url}</code>
      <div className="actions">
        <button className="btn" type="button" onClick={() => copyText(url, toast)}>Copy link</button>
        <a className="btn ghost" href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`} target="_blank" rel="noopener">WhatsApp</a>
      </div>
      <a className="btn ghost" href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`} target="_blank" rel="noopener">Telegram</a>
    </>
  );
}

export function Done({ title, line, children }) {
  return (
    <div className="done-top">
      <span className="okmark">{CHECK}</span>
      <h2>{title}</h2>
      {line && <span className="speed">{line}</span>}
      {children}
    </div>
  );
}

export const Row = ({ k, v }) => <div className="set-row"><span>{k}</span><span style={{ textAlign: 'right', overflowWrap: 'anywhere' }}>{v}</span></div>;
export const Err = ({ children }) => (children ? <p className="err" role="alert" style={{ margin: 0 }}>{children}</p> : null);

export function Bar({ value, max }) {
  const pct = max > 0n ? Number((value * 100n) / max) : 0;
  return <div className="meter" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100"><i style={{ width: `${Math.min(100, pct)}%` }} /></div>;
}

export const Who = ({ a, me }) => (same(a, me) ? 'You' : shortAddr(a));

// "2d 4h", "3h 12m", "45s"
export function span(sec) {
  let s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

// Re-render every second so countdowns and streams move.
export function useTick(on = true) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return undefined;
    const t = setInterval(() => set((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [on]);
}
