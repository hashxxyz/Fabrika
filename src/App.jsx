import { useCallback, useEffect, useState } from 'react';
import useAccount from './useAccount.js';
import { Link, useRoute } from './router.jsx';
import Home from './Home.jsx';
import Transfer from './Transfer.jsx';
import Account from './Account.jsx';
import Settings from './Settings.jsx';
import Claim from './Claim.jsx';
import Invoice from './Invoice.jsx';
import Pay from './Pay.jsx';
import ReceiptPage from './Receipt.jsx';
import Docs from './Docs.jsx';
import Explore from './Explore.jsx';
import Tip from './Tip.jsx';
import Split from './Split.jsx';
import Gift from './Gift.jsx';
import Pledge from './Pledge.jsx';
import Isa from './Isa.jsx';
import Stream from './Stream.jsx';
import Cover from './Cover.jsx';
import Savings from './Savings.jsx';
import { shortAddr } from './lib.js';
import { syncHistory } from './history.js';

const ico = (d) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const NAV = [
  ['/', 'Home', ico(<path d="M4 11l8-7 8 7v8a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1z" />)],
  ['/transfer', 'Send', ico(<path d="M5 12h14M13 6l6 6-6 6" />)],
  ['/explore', 'Explore', ico(<><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></>)],
  ['/account', 'Account', ico(<><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M3 10h18M16 14.5h2" /></>)],
  ['/settings', 'Settings', ico(<><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></>)],
];

export default function App() {
  const acct = useAccount();
  const path = useRoute();
  const [toast, setToastText] = useState('');
  const showToast = useCallback((t) => { setToastText(t); setTimeout(() => setToastText(''), 1800); }, []);

  // Pull history saved from other devices. Re-render the page only if something new arrived.
  const [hv, setHv] = useState(0);
  useEffect(() => {
    if (!acct.authenticated || !acct.address) return;
    let live = true;
    syncHistory(acct).then((n) => { if (live && n > 0) setHv((v) => v + 1); });
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acct.authenticated, acct.address]);

  useEffect(() => { if (acct.welcome === 'done') showToast('Starter balance added'); }, [acct.welcome, showToast]);

  const isClaim = path.startsWith('/claim') || path.startsWith('/pay');
  const landing = path === '/' && !acct.authenticated;

  let page;
  if (path.startsWith('/pay')) page = <Pay acct={acct} />;
  else if (path === '/docs') page = <Docs />;
  else if (path === '/receipt') page = <ReceiptPage toast={showToast} />;
  else if (path.startsWith('/claim')) page = <Claim acct={acct} toast={showToast} />;
  else if (path === '/invoice') page = <Invoice acct={acct} toast={showToast} />;
  else if (path === '/explore') page = <Explore />;
  else if (path === '/tip') page = <Tip acct={acct} toast={showToast} />;
  else if (path === '/split') page = <Split acct={acct} toast={showToast} />;
  else if (path === '/gift') page = <Gift acct={acct} toast={showToast} />;
  else if (path === '/pledge') page = <Pledge acct={acct} toast={showToast} />;
  else if (path === '/isa') page = <Isa acct={acct} toast={showToast} />;
  else if (path === '/stream') page = <Stream acct={acct} toast={showToast} />;
  else if (path === '/cover') page = <Cover acct={acct} toast={showToast} />;
  else if (path === '/save') page = <Savings acct={acct} toast={showToast} />;
  else if (path === '/transfer') page = <Transfer acct={acct} toast={showToast} />;
  else if (path === '/account') page = <Account acct={acct} toast={showToast} />;
  else if (path === '/settings') page = <Settings acct={acct} toast={showToast} />;
  else page = <Home acct={acct} toast={showToast} />;

  return (
    <>
      <header className="top-bar">
        <div className="wrap bar-in">
          <Link className="mark" to="/">
            <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M3 9c6-5 10 5 16 0s7-3 10 0M3 16c6-5 10 5 16 0s7-3 10 0M3 23c6-5 10 5 16 0s7-3 10 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            Fabrika
          </Link>
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
      <main className={landing || isClaim ? 'hero' : 'app-main'}>
        <div className="wrap" key={path === '/account' || path === '/' ? hv : 0}>{page}</div>
      </main>
      <footer className="wrap foot">
        <span>Built on Monad. Testnet only: MON here has no value.</span>
        {path === '/' && (
          <span><Link to="/docs">Docs</Link> &nbsp; <Link to="/docs#faq">FAQ</Link> &nbsp; <a href="https://faucet.monad.xyz" target="_blank" rel="noopener">Get test MON</a> &nbsp; <a href="https://testnet.monadvision.com" target="_blank" rel="noopener">Explorer</a></span>
        )}
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
