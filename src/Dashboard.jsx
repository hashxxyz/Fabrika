import { useState } from 'react';
import Send from './Send.jsx';
import Batches from './Batches.jsx';
import { copyText } from './ui.jsx';
import { FAUCET, VAULT, explorer } from './chain.js';
import { fmtMon, shortAddr } from './lib.js';

export default function Dashboard({ acct, toast }) {
  const [tab, setTab] = useState('send');
  const [bump, setBump] = useState(0);

  if (!acct.address) {
    return <section className="app"><p className="note">Setting up your wallet…</p></section>;
  }
  const empty = acct.balance === 0n;

  return (
    <section className="app">
      <div className="wallet">
        <div>
          <div className="k">Your wallet</div>
          <div className="addr-row">
            <code>{shortAddr(acct.address)}</code>
            <button className="copy" type="button" onClick={() => copyText(acct.address, toast)}>Copy</button>
          </div>
        </div>
        <div className="bal"><span className="n">{acct.balance == null ? '…' : fmtMon(acct.balance)}</span><span className="u">MON</span></div>
      </div>
      {empty && <p className="note warn">Your balance is empty. Get free test MON from the <a href={FAUCET} target="_blank" rel="noopener">faucet</a>, sent to the address above.</p>}
      {!VAULT && <p className="note warn">Vault address is not set. Add <code>VITE_VAULT_ADDRESS</code> to enable payouts.</p>}

      <div className="tabs" role="tablist">
        <button className="tab" role="tab" aria-selected={tab === 'send'} type="button" onClick={() => setTab('send')}>New payout</button>
        <button className="tab" role="tab" aria-selected={tab === 'batches'} type="button" onClick={() => setTab('batches')}>Payouts</button>
      </div>

      {tab === 'send' && <Send acct={acct} toast={toast} onDone={() => setBump((b) => b + 1)} goBatches={() => setTab('batches')} />}
      {tab === 'batches' && <Batches key={bump} acct={acct} toast={toast} />}
      {VAULT && <p className="note" style={{ marginTop: 28 }}>Vault: <a href={explorer.address(VAULT)} target="_blank" rel="noopener">{shortAddr(VAULT)}</a></p>}
    </section>
  );
}
