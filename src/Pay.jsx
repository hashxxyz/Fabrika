import { useEffect, useState } from 'react';
import { formatEther } from 'viem';
import { PAY, payAbi, publicClient, FAUCET, PAY_STATUS } from './chain.js';
import { ReceiptCard } from './Receipt.jsx';
import { fmtMon, fmtDate, shortAddr, cleanError } from './lib.js';
import { Badge } from './ui.jsx';
import { decodeDetails, detailItems, detailTotals, money } from './invoiceLib.js';

const ID_RE = /^0x[0-9a-fA-F]{64}$/;

export default function Pay({ acct }) {
  const qs = new URLSearchParams(location.search);
  const id = qs.get('i') || '';
  const det = decodeDetails(qs.get('d'));
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

  const dt = det ? detailTotals(det) : null;
  // Show the breakdown only when it adds up to exactly what the contract will charge.
  const rich = !!(info && det && dt.total === info.amount);
  const verified = who && (who.x ? `@${who.x} (verified on X)` : who.email ? `${who.email} (verified email)` : '');
  const open = info && info.status === 1;
  const mine = info && acct.address && info.recipient.toLowerCase() === acct.address.toLowerCase();
  const low = open && acct.balance != null && acct.balance < info.amount;

  return (
    <section className="col" style={{ paddingBlock: '24px 40px' }}>
      <div className="card">
        {loadErr ? <p className="err">{loadErr}</p> : !info ? <p className="note" style={{ margin: 0 }}>Loading invoice…</p> : (
          <>
            <div className="inv-doc">
              <div className="card-head"><h3>Invoice</h3><Badge>{paid ? 'Paid' : PAY_STATUS[info.status]}</Badge></div>
              {rich && det.s ? <p className="note" style={{ margin: 0 }}>Issued {new Date(det.s * 1000).toLocaleDateString(undefined, { dateStyle: 'medium' })}</p> : null}
              <div className="slip-amt" style={{ margin: 0 }}>{fmtMon(info.amount)}<small>MON</small></div>
              {!rich && <p className="sub" style={{ margin: 0 }}>{info.note}</p>}
              <div>
                <div className="set-row"><span>From</span><span>{verified ? <b>{verified}</b> : who === null ? shortAddr(info.recipient) : <>Not verified · {shortAddr(info.recipient)}</>}</span></div>
                {rich && det.b && <div className="set-row"><span>Name given by sender</span><span>{det.b}</span></div>}
                {rich && (det.c || det.e) && <div className="set-row"><span>Bill to</span><span>{det.c}{det.c && det.e ? <br /> : null}{det.e}</span></div>}
                <div className="set-row"><span>Pay by</span><span>{Number(info.expiresAt) ? fmtDate(info.expiresAt) : 'No deadline'}</span></div>
              </div>
              {rich && (
                <div className="inv-lines">
                  <div className="inv-l head"><span>Item</span><span>Qty</span><span>Amount</span></div>
                  {detailItems(det).map((it, i) => (
                    <div className="inv-l" key={i}><span>{it.d}<small>{money(it.p)} each</small></span><span>{it.q}</span><span>{money(BigInt(it.q) * it.p)}</span></div>
                  ))}
                  <div className="set-row"><span>Subtotal</span><span>{money(dt.sub)}</span></div>
                  {dt.disc > 0n && <div className="set-row"><span>Discount</span><span>−{money(dt.disc)}</span></div>}
                  {dt.tax > 0n && <div className="set-row"><span>Tax ({det.x / 100}%)</span><span>{money(dt.tax)}</span></div>}
                  <div className="set-row"><span><b>Total</b></span><span><b>{money(dt.total)}</b></span></div>
                </div>
              )}
              {rich && det.m && <p className="note" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{det.m}</p>}
              {det && !rich && <p className="note warn" style={{ margin: 0 }}>The item details in this link do not match the amount, so they are hidden. Pay only if the amount above is what you agreed.</p>}
            </div>
            <button className="btn ghost no-print" type="button" onClick={() => window.print()}>Download or print</button>
            {paid && (
              <ReceiptCard
                title="Invoice paid" amount={info.amount} hash={paid.hash} took={paid.took}
                rows={[['Paid to', verified || shortAddr(info.recipient)], info.note ? ['For', info.note] : null, ['From', shortAddr(acct.address)]]}
              />
            )}
            {open && !paid && (
              <>
                <p className="callout no-print">Only pay someone you know, and check that the amount and note match what they told you.</p>
                {!acct.authenticated
                  ? <button className="btn" type="button" onClick={acct.login} disabled={!acct.ready}>Sign in to pay</button>
                  : mine
                    ? <p className="callout">This is your own invoice. Send the link to the person paying.</p>
                    : <button className="btn" type="button" onClick={pay} disabled={!!busy || !acct.address || low}>{busy || `Pay ${formatEther(info.amount)} MON`}</button>}
                {low && !mine && (acct.welcome === 'sending'
                  ? <p className="callout">Adding a starter balance to your account…</p>
                  : <p className="callout warn">You need more funds to pay this. <a href={FAUCET} target="_blank" rel="noopener">Add funds</a></p>)}
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
