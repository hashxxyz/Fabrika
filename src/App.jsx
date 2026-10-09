import { useCallback, useState } from 'react';
import useAccount from './useAccount.js';
import Home from './Home.jsx';
import Dashboard from './Dashboard.jsx';
import Claim from './Claim.jsx';
import { shortAddr } from './lib.js';

export default function App() {
  const acct = useAccount();
  const [toast, setToastText] = useState('');
  const showToast = useCallback((t) => { setToastText(t); setTimeout(() => setToastText(''), 1800); }, []);
  const [theme, setTheme] = useState(document.documentElement.getAttribute('data-theme') || '');

  const flip = () => {
    const dark = theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('fabrika.theme', next); } catch { /* ignore */ }
    setTheme(next);
  };

  const onClaim = location.pathname.startsWith('/claim');

  return (
    <>
      <div className="hero">
        <div className="wrap">
          <header className="top">
            <a className="mark" href="/">
              <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M3 9c6-5 10 5 16 0s7-3 10 0M3 16c6-5 10 5 16 0s7-3 10 0M3 23c6-5 10 5 16 0s7-3 10 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              Fabrika
            </a>
            <span className="bar">
              <button className="pill" type="button" onClick={flip} aria-label="Switch between light and dark">Theme</button>
              {acct.authenticated ? (
                <>
                  <span className="pill static">{acct.label || shortAddr(acct.address) || 'Signed in'}</span>
                  <button className="pill" type="button" onClick={acct.logout}>Sign out</button>
                </>
              ) : (
                <button className="pill solid" type="button" onClick={acct.login} disabled={!acct.ready}>Sign in</button>
              )}
            </span>
          </header>
          {onClaim ? <Claim acct={acct} toast={showToast} /> : acct.authenticated ? <Dashboard acct={acct} toast={showToast} /> : <Home acct={acct} />}
        </div>
      </div>
      <footer className="wrap foot">
        <span>Testnet only. MON on this network has no value.</span>
        <span><a href="https://faucet.monad.xyz" target="_blank" rel="noopener">Faucet</a> &nbsp; <a href="https://testnet.monadvision.com" target="_blank" rel="noopener">Explorer</a></span>
      </footer>
      <div className={'toast' + (toast ? ' on' : '')} role="status" aria-live="polite">{toast}</div>
    </>
  );
}
