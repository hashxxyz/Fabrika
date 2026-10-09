import { useEffect, useState } from 'react';
import { formatEther } from 'viem';
import { PAY, payAbi, publicClient, explorer, FAUCET, PAY_STATUS } from './chain.js';
import { fmtMon, fmtDate, shortAddr, cleanError } from './lib.js';
import { Badge } from './ui.jsx';

const ID_RE = /^0x[0-9a-fA-F]{64}$/;
const CHECK = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;

export default function Pay({ acct }) {
  const id = new URLSearchParams(location.search).get('i') || '';
  const [info, setInfo] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [paid, setPaid] = useState(null);
  const [who, setWho] = useState(null);

  async function load() {
    try {
      const [r, note] = await Promise.all([
        publicClient.readContract({ address: PAY, abi: payAbi, functionName: 'getRequest', args: [id] }),
        publicClient.readContract({ address: PAY, abi: payAbi, functionName: 'noteOf', args: [id] }),
      ]);
      if (Number(r[3]) === 0) setLoadErr('No invoice found for this link.');
      else {
        setInfo({ recipient: r[0], amount: r[1], expiresAt: r[2], status: Number(r[3]), note });
        fetch(`/api/who?a=${r[0]}`).then((x) => (x.ok ? x.json() : {})).then(setWho).catch(() => setWho({}));
      }
    } catch { setLoadErr('Could not load this invoice. Try again.'); }
  }

  useEffect(() => {
    if (!ID_RE.test(id)) { setLoadErr('This invoice link is not valid.'); return; }
    if (!PAY) { setLoadErr('Invoices are not switched on yet.'); return; }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function pay() {
    setErr('');
    try {
      setBusy('Confirm…');
      const wc = await acct.getClient();
      const hash = await wc.writeContract({ address: PAY, abi: payAbi, functionName: 'pay', args: [id], value: info.amount });
      setBusy('Paying…');
      const t0 = performance.now();
      const rc = await publicClient.waitForTransactionReceipt({ hash });
      if (rc.status !== 'success') throw new Error('The payment failed.');
      setPaid({ hash, took: Math.max(0.1, (performance.now() - t0) / 1000).toFixed(1) });
      acct.refresh();
      load();
    } catch (e) {
      setErr(cleanError(e));
    } finally {
      setBusy('');
    }
  }

  const verified = who && (who.x ? `@${who.x} (verified on X)` : who.email ? `${who.email} (verified email)` : '');
  const open = info && info.status === 1;
  const mine = info && acct.address && info.recipient.toLowerCase() === acct.address.toLowerCase();
  const low = open && acct.balance != null && acct.balance < info.amount;

  return (
    <section className="col" style={{ paddingBlock: '24px 40px' }}>
      <div className="card">
        {loadErr ? <p className="err">{loadErr}</p> : !info ? <p className="note" style={{ margin: 0 }}>Loading invoice…</p> : (
          <>
            <div className="card-head"><h3>Invoice</h3><Badge>{paid ? 'Paid' : PAY_STATUS[info.status]}</Badge></div>
            <div className="slip-amt" style={{ margin: 0 }}>{fmtMon(info.amount)}<small>MON</small></div>
            <p className="sub" style={{ margin: 0 }}>{info.note}</p>
            <div>
              <div className="set-row"><span>Requested by</span><span>{verified ? <b>{verified}</b> : who === null ? shortAddr(info.recipient) : <>Not verified · {shortAddr(info.recipient)}</>}</span></div>
              <div className="set-row"><span>Pay by</span><span>{Number(info.expiresAt) ? fmtDate(info.expiresAt) : 'No deadline'}</span></div>
            </div>
            {paid && (
              <div className="done-top">
                <span className="okmark">{CHECK}</span>
                <span className="speed">Paid in {paid.took}s · <a href={explorer.tx(paid.hash)} target="_blank" rel="noopener">Receipt</a></span>
              </div>
            )}
            {open && !paid && (
              <>
                <p className="callout">Only pay someone you know, and check that the amount and note match what they told you.</p>
                {!acct.authenticated
                  ? <button className="btn" type="button" onClick={acct.login} disabled={!acct.ready}>Sign in to pay</button>
                  : mine
                    ? <p className="callout">This is your own invoice. Send the link to the person paying.</p>
                    : <button className="btn" type="button" onClick={pay} disabled={!!busy || !acct.address || low}>{busy || `Pay ${formatEther(info.amount)} MON`}</button>}
                {low && !mine && (acct.welcome === 'sending'
                  ? <p className="callout">Adding a starter balance to your account…</p>
                  : <p className="callout warn">You need more MON to pay this. <a href={FAUCET} target="_blank" rel="noopener">Get test MON</a></p>)}
                {err && <p className="err" role="alert" style={{ margin: 0 }}>{err}</p>}
              </>
            )}
            {!open && !paid && <p className="note" style={{ margin: 0 }}>This invoice is {PAY_STATUS[info.status].toLowerCase()} and can no longer be paid.</p>}
          </>
        )}
      </div>
    </section>
  );
}
