import { useCallback, useState } from 'react';
import useAccount from './useAccount.js';
import { Link, useRoute } from './router.jsx';
import Home from './Home.jsx';
import Transfer from './Transfer.jsx';
import Account from './Account.jsx';
import Settings from './Settings.jsx';
import Claim from './Claim.jsx';
import { shortAddr } from './lib.js';

const NAV = [['/', 'Home'], ['/transfer', 'Transfer'], ['/account', 'Account'], ['/settings', 'Settings']];

export default function App() {
  const acct = useAccount();
  const path = useRoute();
  const [toast, setToastText] = useState('');
  const showToast = useCallback((t) => { setToastText(t); setTimeout(() => setToastText(''), 1800); }, []);

  let page;
  if (path.startsWith('/claim')) page = <Claim acct={acct} toast={showToast} />;
  else if (path === '/transfer') page = <Transfer acct={acct} toast={showToast} />;
  else if (path === '/account') page = <Account acct={acct} toast={showToast} />;
  else if (path === '/settings') page = <Settings acct={acct} toast={showToast} />;
  else page = <Home acct={acct} />;

  const showNav = !path.startsWith('/claim');

  return (
    <>
      <div className="hero">
        <div className="wrap">
          <header className="top">
            <Link className="mark" to="/">
              <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M3 9c6-5 10 5 16 0s7-3 10 0M3 16c6-5 10 5 16 0s7-3 10 0M3 23c6-5 10 5 16 0s7-3 10 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              Fabrika
            </Link>
            {showNav && (
              <nav className="nav" aria-label="Main">
                {NAV.map(([to, l]) => <Link key={to} to={to}>{l}</Link>)}
              </nav>
            )}
            <span className="bar">
              {acct.authenticated
                ? <Link className="pill" to="/account">{acct.label || shortAddr(acct.address) || 'Signed in'}</Link>
                : <button className="pill solid" type="button" onClick={acct.login} disabled={!acct.ready}>Sign in</button>}
            </span>
          </header>
          {page}
        </div>
      </div>
      <footer className="wrap foot">
        <span>Testnet only. MON on this network has no value.</span>
        <span><a href="https://faucet.monad.xyz" target="_blank" rel="noopener">Faucet</a> &nbsp; <a href="https://testnet.monadvision.com" target="_blank" rel="noopener">Explorer</a></span>
      </footer>
      {showNav && (
        <nav className="tabbar" aria-label="Main">
          {NAV.map(([to, l]) => <Link key={to} to={to}>{l}</Link>)}
        </nav>
      )}
      <div className={'toast' + (toast ? ' on' : '')} role="status" aria-live="polite">{toast}</div>
    </>
  );
}
