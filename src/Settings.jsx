import { useState } from 'react';
import { VAULT, BOT, FAUCET, explorer } from './chain.js';
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
    if (!window.confirm('Remove saved payouts and transfers from this device? Money in the vault is not affected.')) return;
    clearLocalData(acct.address);
    toast('Cleared from this device');
  }

  return (
    <section className="page">
      <div className="pane">
        <h2>Settings</h2>

        <div className="field">
          <label>Appearance</label>
          <div className="seg" role="tablist" aria-label="Theme">
            {THEMES.map(([v, l]) => (
              <button key={l} type="button" role="tab" aria-selected={theme === v} onClick={() => pick(v)}>{l}</button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Network</label>
          <ul className="kv">
            <li><span>Chain</span><span>Monad Testnet (10143)</span></li>
            <li><span>Vault</span><span>{VAULT ? <a href={explorer.address(VAULT)} target="_blank" rel="noopener">{shortAddr(VAULT)}</a> : 'Not set'}</span></li>
            <li><span>Telegram bot</span><span>{BOT ? `@${BOT}` : 'Not set'}</span></li>
            <li><span>Faucet</span><span><a href={FAUCET} target="_blank" rel="noopener">faucet.monad.xyz</a></span></li>
          </ul>
        </div>

        {acct.authenticated ? (
          <>
            <div className="field">
              <label>Data on this device</label>
              <p className="note" style={{ margin: 0 }}>Payout names and wallet transfers are saved here only.</p>
              <button className="btn ghost" type="button" onClick={clear} style={{ marginTop: 6 }}>Clear saved data</button>
            </div>
            <button className="btn ghost" type="button" onClick={acct.logout}>Sign out</button>
          </>
        ) : (
          <button className="btn" type="button" onClick={acct.login} disabled={!acct.ready}>Sign in</button>
        )}
      </div>
    </section>
  );
}
