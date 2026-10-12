import { useEffect, useState } from 'react';

export function Stitch() {
  return (
    <svg className="stitch" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
      <line className="base" x1="0" y1="4" x2="100" y2="4" />
      <line className="done" x1="0" y1="4" x2="100" y2="4" pathLength="100" />
    </svg>
  );
}

export function Badge({ children }) {
  return <span className="badge"><i />{children}</span>;
}

export function copyText(text, toast) {
  const done = () => toast && toast('Copied');
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, done);
  else done();
}

// Balance privacy: one switch for the whole app, remembered on this device (not on the chain, not on the server).
const HIDE_KEY = 'fabrika.hideBalance';
const hideSubs = new Set();
let hideNow = false;
try { hideNow = localStorage.getItem(HIDE_KEY) === '1'; } catch { /* storage blocked: stays visible */ }

export function useHideBalance() {
  const [hidden, setHidden] = useState(hideNow);
  useEffect(() => {
    hideSubs.add(setHidden);
    setHidden(hideNow);
    return () => { hideSubs.delete(setHidden); };
  }, []);
  const toggle = () => {
    hideNow = !hideNow;
    try { localStorage.setItem(HIDE_KEY, hideNow ? '1' : '0'); } catch { /* storage blocked: lasts until reload */ }
    hideSubs.forEach((fn) => fn(hideNow));
  };
  return { hidden, toggle };
}

export function BalanceEye({ hidden, onToggle }) {
  return (
    <button className="eye" type="button" onClick={onToggle} aria-pressed={hidden} aria-label={hidden ? 'Show balance' : 'Hide balance'} title={hidden ? 'Show balance' : 'Hide balance'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
        {hidden && <path d="M4 4l16 16" />}
      </svg>
    </button>
  );
}
