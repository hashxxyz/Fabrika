import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

// A QR code for a link. Long invoice links carry line items in a "d" parameter. The pay page reads the real
// amount from the chain, so for a QR we drop "d" when the link is too long to scan.
export function QRToggle({ url, className = '' }) {
  const [on, setOn] = useState(false);
  return (
    <>
      <button className={className} type="button" onClick={() => setOn(!on)} aria-expanded={on}>{on ? 'Hide QR code' : 'Show QR code'}</button>
      {on && <QR url={url} />}
    </>
  );
}

export function QR({ url, size = 200 }) {
  const [src, setSrc] = useState('');
  const [bad, setBad] = useState(false);
  useEffect(() => {
    let live = true;
    let u = url;
    if (u.length > 900) { try { const x = new URL(u); x.searchParams.delete('d'); u = x.toString(); } catch { /* keep as is */ } }
    QRCode.toDataURL(u, { margin: 1, width: size * 2, errorCorrectionLevel: 'M', color: { dark: '#14102b', light: '#ffffff' } })
      .then((d) => { if (live) { setSrc(d); setBad(false); } })
      .catch(() => { if (live) { setSrc(''); setBad(true); } });
    return () => { live = false; };
  }, [url, size]);
  if (bad) return <p className="note" style={{ margin: 0 }}>This link is too long for a QR code. Use Copy link instead.</p>;
  return src ? <img className="qr" src={src} alt="QR code. Scan it with a phone camera to open the link." width={size} height={size} /> : null;
}

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
  const ok = () => toast && toast('Copied');
  const fail = () => toast && toast('Could not copy. Select the text and copy it by hand.');
  // Older browsers and some in-app browsers block the clipboard API. Fall back to a hidden textarea.
  const legacy = () => {
    try {
      const t = document.createElement('textarea');
      t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(t); t.select();
      const good = document.execCommand('copy');
      t.remove();
      good ? ok() : fail();
    } catch { fail(); }
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(ok, legacy);
  else legacy();
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
