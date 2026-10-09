import { copyText } from './ui.jsx';
import { FAUCET, VAULT, explorer } from './chain.js';
import { fmtMon, shortAddr, loadTransfers } from './lib.js';
import { Link } from './router.jsx';
import Batches from './Batches.jsx';
import Gate from './Gate.jsx';

export default function Account({ acct, toast }) {
  return (
    <Gate acct={acct} title="Account">
      <section className="page">
        <div className="wallet">
          <div>
            <div className="k">{acct.label || 'Your wallet'}</div>
            <div className="addr-row">
              <code>{shortAddr(acct.address)}</code>
              <button className="copy" type="button" onClick={() => copyText(acct.address, toast)}>Copy address</button>
            </div>
          </div>
          <div className="bal"><span className="n">{acct.balance == null ? '…' : fmtMon(acct.balance)}</span><span className="u">MON</span></div>
        </div>
        {acct.balance === 0n && (
          <p className="note warn">Your balance is empty. Get free test MON from the <a href={FAUCET} target="_blank" rel="noopener">faucet</a>, sent to the address above.</p>
        )}
        <p className="note">
          <a href={explorer.address(acct.address)} target="_blank" rel="noopener">View on explorer</a>
          {' · '}<Link to="/transfer">Send money</Link>
        </p>

        <div className="block"><Batches acct={acct} toast={toast} /></div>
        <Transfers address={acct.address} />
        {VAULT && <p className="note" style={{ marginTop: 28 }}>Vault: <a href={explorer.address(VAULT)} target="_blank" rel="noopener">{shortAddr(VAULT)}</a></p>}
      </section>
    </Gate>
  );
}

function Transfers({ address }) {
  const list = loadTransfers(address);
  if (!list.length) return null;
  return (
    <div className="pane wide block">
      <h2>Wallet transfers</h2>
      <p>Direct sends from this device.</p>
      <ul className="hist">
        {list.map((t) => (
          <li key={t.hash}>
            <span className="t">{shortAddr(t.to)}</span>
            <span className="a">{fmtMon(BigInt(t.amount))} MON</span>
            <span className="links"><a href={explorer.tx(t.hash)} target="_blank" rel="noopener">Transaction</a></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
