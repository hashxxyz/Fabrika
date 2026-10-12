import { copyText, BalanceEye, useHideBalance } from './ui.jsx';
import { FAUCET, explorer } from './chain.js';
import { fmtMon, shortAddr, loadTransfers } from './lib.js';
import { Link } from './router.jsx';
import { receiptPath } from './Receipt.jsx';
import Batches from './Batches.jsx';
import Invoices from './Invoices.jsx';
import Gate from './Gate.jsx';
import Pending from './Pending.jsx';
import Activity from './Activity.jsx';

export default function Account({ acct, toast }) {
  const { hidden, toggle } = useHideBalance();
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
          <a className="btn ghost" href={explorer.address(acct.address)} target="_blank" rel="noopener">View on explorer</a>
        </div>
        {acct.balance === 0n && !hidden && (
          <p className="callout warn">Your balance is empty. Get free test MON from the <a href={FAUCET} target="_blank" rel="noopener">faucet</a> and paste the address above.</p>
        )}
        <Pending acct={acct} toast={toast} prompt />
        <Invoices acct={acct} toast={toast} />
        <Batches acct={acct} toast={toast} />
        <Activity acct={acct} toast={toast} />
        <Transfers address={acct.address} />
      </section>
    </Gate>
  );
}

function Transfers({ address }) {
  const list = loadTransfers(address);
  if (!list.length) return null;
  return (
    <div className="card">
      <h3>Wallet transfers</h3>
      <div>
        {list.map((t) => (
          <div className="act" key={t.hash}>
            <span className="t">{shortAddr(t.to)}{t.note ? <span className="note"> · {t.note}</span> : null}</span>
            <span className="a">{fmtMon(BigInt(t.amount))} MON</span>
            <span className="s"><Link to={receiptPath(t.hash)}>Receipt</Link></span>
          </div>
        ))}
      </div>
    </div>
  );
}
