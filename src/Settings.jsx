import { useState } from 'react';
import { VAULT, PAY, BOT, FAUCET, explorer } from './chain.js';
import { clearLocalData, shortAddr } from './lib.js';

const THEMES = [['', 'System'], ['light', 'Light'], ['dark', 'Dark']];

export default function Settings({ acct, toast }) {
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || '');

  function pick(v) {
    if (v) document.documentElement.setAttribute('data-theme', v);
    else document.documentElement.removeAttribute('data-theme');
    try { v ? localStorage.setItem('fabrika.theme', v) : localStorage.removeItem('fabrika.theme'); } catch { /* ignore */ }
    setTheme(v);
  }

  function clear() {
    if (!acct.address) return;
    if (!window.confirm('Remove the saved copy from this device? Your history comes back from your account next time you sign in. Money you sent is not affected.')) return;
    clearLocalData(acct.address);
    toast('Cleared from this device');
  }

  return (
    <section className="col">
      <h1 className="title">Settings</h1>

      <div className="card">
        <h3>Appearance</h3>
        <div className="seg" role="tablist" aria-label="Theme">
          {THEMES.map(([v, l]) => (
            <button key={l} type="button" role="tab" aria-selected={theme === v} onClick={() => pick(v)}>{l}</button>
          ))}
        </div>
      </div>

      {acct.authenticated && (
        <div className="card">
          <h3>Your account</h3>
          <div>
            <div className="set-row"><span>Signed in as</span><span>{acct.label || 'Wallet'}</span></div>
            <div className="set-row"><span>Address</span><span>{shortAddr(acct.address)}</span></div>
          </div>
          <p className="note" style={{ margin: 0 }}>Your activity is saved on this device and on your account, so it shows on your other devices too. Clearing it here does not touch any money.</p>
          <button className="btn ghost" type="button" onClick={clear}>Clear saved activity</button>
          <button className="btn ghost" type="button" onClick={acct.logout}>Sign out</button>
        </div>
      )}
      {acct.authenticated && acct.canExport && (
        <div className="card">
          <h3>Back up your wallet</h3>
          <p className="note" style={{ margin: 0 }}>Export your private key to use this same wallet in MetaMask or another wallet app. It opens in a secure Privy window, so Fabrika never sees it.</p>
          <p className="callout warn">Anyone with this key can take everything in the wallet. Never share it or paste it anywhere you do not trust.</p>
          <button className="btn ghost" type="button" onClick={() => acct.exportKey().catch(() => toast('Could not open export. Try again.'))}>Export private key</button>
        </div>
      )}
      {!acct.authenticated && (
        <button className="btn" type="button" onClick={acct.login} disabled={!acct.ready}>Sign in</button>
      )}

      <details className="card paste">
        <summary>Technical details</summary>
        <div style={{ marginTop: 12 }}>
          <div className="set-row"><span>Network</span><span>Monad Testnet (10143)</span></div>
          <div className="set-row"><span>Payment contract</span><span>{VAULT ? <a href={explorer.address(VAULT)} target="_blank" rel="noopener">{shortAddr(VAULT)}</a> : 'Not set'}</span></div>
          <div className="set-row"><span>Invoice contract</span><span>{PAY ? <a href={explorer.address(PAY)} target="_blank" rel="noopener">{shortAddr(PAY)}</a> : 'Not set'}</span></div>
          <div className="set-row"><span>Telegram bot</span><span>{BOT ? `@${BOT}` : 'Not set'}</span></div>
          <div className="set-row"><span>Test MON</span><span><a href={FAUCET} target="_blank" rel="noopener">faucet.monad.xyz</a></span></div>
        </div>
      </details>
    </section>
  );
}
