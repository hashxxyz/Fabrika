import { useState } from 'react';
import { copyText, BalanceEye, useHideBalance } from './ui.jsx';
import { FAUCET } from './chain.js';
import { fmtMon, shortAddr } from './lib.js';
import { Link } from './router.jsx';
import Batches from './Batches.jsx';
import Invoices from './Invoices.jsx';
import Gate from './Gate.jsx';
import Pending from './Pending.jsx';
import Activity from './Activity.jsx';

// One History card instead of four stacked ones. All three panels stay mounted (hidden) so switching tabs is instant.
const TABS = [['activity', 'Activity'], ['payouts', 'Payouts'], ['invoices', 'Invoices']];
const HINT = {
  activity: 'Everything sent or received by this wallet, including from other apps.',
  payouts: 'Payments you sent to a Telegram or X username, with live status.',
  invoices: 'Requests for payment you created.',
};

export default function Account({ acct, toast }) {
  const { hidden, toggle } = useHideBalance();
  const [tab, setTab] = useState('activity');
  return (
    <Gate acct={acct} title="Account">
      <section className="col dash">
        <h1 className="title">Account</h1>
        <div className="balcard">
          <div className="balrow"><div className="k">{acct.label || 'Your account'}</div><BalanceEye hidden={hidden} onToggle={toggle} /></div>
          <div className="big"><span aria-label={hidden ? 'Balance hidden' : undefined}>{acct.balance == null ? '…' : hidden ? '••••' : fmtMon(acct.balance)}</span><small>MON</small></div>
          <div className="addr">
            <code>{shortAddr(acct.address)}</code>
            <button className="copy" type="button" onClick={() => copyText(acct.address, toast)}>Copy address</button>
          </div>
        </div>
        <div className="actions">
          <Link className="btn" to="/transfer">Send money</Link>
        </div>
        {acct.balance === 0n && !hidden && (
          <p className="callout warn">Your balance is empty. Your starter balance should arrive in a moment. If it does not, <a href={FAUCET} target="_blank" rel="noopener">add funds here</a>.</p>
        )}
        <Pending acct={acct} toast={toast} prompt />
        <div className="card hist-card">
          <div>
            <h2 className="hist-title">History</h2>
            <p className="note" style={{ margin: '4px 0 0' }}>{HINT[tab]}</p>
          </div>
          <div className="seg" role="tablist" aria-label="History">
            {TABS.map(([v, l]) => (
              <button key={v} id={`h-tab-${v}`} type="button" role="tab" aria-selected={tab === v} aria-controls={`h-panel-${v}`} onClick={() => setTab(v)}>{l}</button>
            ))}
          </div>
          <div id="h-panel-activity" role="tabpanel" aria-labelledby="h-tab-activity" hidden={tab !== 'activity'}><Activity acct={acct} toast={toast} /></div>
          <div id="h-panel-payouts" role="tabpanel" aria-labelledby="h-tab-payouts" hidden={tab !== 'payouts'}><Batches acct={acct} toast={toast} embedded /></div>
          <div id="h-panel-invoices" role="tabpanel" aria-labelledby="h-tab-invoices" hidden={tab !== 'invoices'}><Invoices acct={acct} toast={toast} embedded /></div>
        </div>
      </section>
    </Gate>
  );
}
