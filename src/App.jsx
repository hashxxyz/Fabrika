import { useCallback, useEffect, useRef, useState } from 'react';
import useAccount from './useAccount.js';
import { Link, useRoute, goBack, previousPath, navigate } from './router.jsx';
import Home from './Home.jsx';
import Transfer from './Transfer.jsx';
import Account from './Account.jsx';
import Settings from './Settings.jsx';
import Claim from './Claim.jsx';
import Invoice from './Invoice.jsx';
import Pay from './Pay.jsx';
import ReceiptPage from './Receipt.jsx';
import Docs from './Docs.jsx';
import Split from './Split.jsx';
import Savings from './Savings.jsx';
import Stats from './Stats.jsx';
import { shortAddr } from './lib.js';
import markImage from './markImage.js';
import { syncHistory } from './history.js';

const ico = (d) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const NAV = [
  ['/', 'Home', ico(<path d="M4 11l8-7 8 7v8a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1z" />)],
  ['/save', 'Savings', ico(<><rect x="4" y="5" width="16" height="14" rx="3" /><circle cx="12" cy="12" r="2.5" /></>)],
  ['/invoice', 'Invoice', ico(<><path d="M7 3h8l4 4v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" /><path d="M15 3v4h4M9 12h6M9 16h6" /></>)],
  ['/account', 'Account', ico(<><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M3 10h18M16 14.5h2" /></>)],
  ['/settings', 'Settings', ico(<><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></>)],
];

// Old /explore links land on Home, where those actions now live.
function Redirect({ to }) {
  useEffect(() => { navigate(to, { replace: true }); }, [to]);
  return null;
}

// Where Back goes when there is no earlier page in this visit (for example a page opened from a bookmark).
const PARENT = { '/receipt': '/account' };
const NAMES = { '/': 'Home', '/transfer': 'Send', '/account': 'Account', '/settings': 'Settings', '/invoice': 'Invoice', '/split': 'Split a bill', '/save': 'Goal savings', '/docs': 'Docs', '/stats': 'Stats', '/receipt': 'Receipt' };
const ARROW_LEFT = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
);

export default function App() {
  const acct = useAccount();
  const path = useRoute();
  const [toast, setToastText] = useState('');
  const toastTimer = useRef(0);
  // Each toast gets its full time. A new one cancels the old timer, so it is never cut short.
  const showToast = useCallback((t) => {
    clearTimeout(toastTimer.current);
    setToastText(t);
    toastTimer.current = setTimeout(() => setToastText(''), 1800);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Pull history saved from other devices. Re-render the page only if something new arrived.
  const [hv, setHv] = useState(0);
  const acctRef = useRef(acct);
  acctRef.current = acct;
  useEffect(() => {
    if (!acct.authenticated || !acct.address) return;
    let live = true;
    syncHistory(acctRef.current).then((n) => { if (live && n > 0) setHv((v) => v + 1); });
    return () => { live = false; };
  }, [acct.authenticated, acct.address]);

  useEffect(() => { if (acct.welcome === 'done') showToast('Starter balance added'); }, [acct.welcome, showToast]);

  const isClaim = path.startsWith('/claim') || path.startsWith('/pay');
  const landing = path === '/' && !acct.authenticated;
  const showBack = !isClaim && path !== '/';
  const parent = path === '/save' && location.search ? '/save' : PARENT[path] || '/';
  const backTo = NAMES[previousPath()] || NAMES[parent];

  let page;
  if (path.startsWith('/pay')) page = <Pay acct={acct} />;
  else if (path === '/docs') page = <Docs />;
  else if (path === '/stats') page = <Stats />;
  else if (path === '/receipt') page = <ReceiptPage toast={showToast} />;
  else if (path.startsWith('/claim')) page = <Claim acct={acct} toast={showToast} />;
  else if (path === '/invoice') page = <Invoice acct={acct} toast={showToast} />;
  else if (path === '/explore') page = <Redirect to="/" />;
  else if (path === '/split') page = <Split acct={acct} toast={showToast} />;
  else if (path === '/save') page = <Savings acct={acct} toast={showToast} />;
  else if (path === '/transfer') page = <Transfer acct={acct} toast={showToast} />;
  else if (path === '/account') page = <Account acct={acct} toast={showToast} version={hv} />;
  else if (path === '/settings') page = <Settings acct={acct} toast={showToast} />;
  else page = <Home acct={acct} toast={showToast} />;

  return (
    <>
      <header className="top-bar">
        <div className="wrap bar-in">
          <div className="bar-left">
            {showBack && (
              <button className="back" type="button" onClick={() => goBack(parent)} aria-label={`Back to ${backTo}`} title={`Back to ${backTo}`}>{ARROW_LEFT}</button>
            )}
            <Link className="mark" to="/">
              <img src={markImage} alt="" width="30" height="30" />
              Fabrika
            </Link>
          </div>
          {!isClaim && (
            <nav className="nav" aria-label="Main">
              {NAV.map(([to, l, i]) => <Link key={to} to={to}>{i}{l}</Link>)}
            </nav>
          )}
          <span className="bar">
            {acct.authenticated
              ? <Link className="pill" to="/account">{acct.label || shortAddr(acct.address) || 'Signed in'}</Link>
              : <button className="pill solid" type="button" onClick={acct.login} disabled={!acct.ready}>Sign in</button>}
          </span>
        </div>
      </header>
      <main className={isClaim ? 'hero claim' : landing ? 'hero' : 'app-main'}>
        <div className="wrap">{page}</div>
      </main>
      <footer className="wrap foot">
        <span>Demo on Monad testnet. Money here has no real value.</span>
        <span>
          {path === '/' && (<><Link to="/docs">Docs</Link> &nbsp; <Link to="/docs#faq">FAQ</Link> &nbsp; <Link to="/stats">Stats</Link> &nbsp; <a href="https://faucet.monad.xyz" target="_blank" rel="noopener">Add funds</a> &nbsp; </>)}
          <a href="https://x.com/monadfabrika" target="_blank" rel="noopener noreferrer">Follow on X</a>
        </span>
      </footer>
      {!isClaim && (
        <nav className="tabbar" aria-label="Main">
          {NAV.map(([to, l, i]) => <Link key={to} to={to}>{i}{l}</Link>)}
        </nav>
      )}
      <div className={'toast' + (toast ? ' on' : '')} role="status" aria-live="polite">{toast}</div>
    </>
  );
}
