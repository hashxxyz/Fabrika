import { useEffect, useState } from 'react';
import { decodeFunctionData } from 'viem';
import { VAULT, PAY, vaultAbi, payAbi, publicClient, explorer } from './chain.js';
import { fmtMon, shortAddr, fmtDate, cleanError } from './lib.js';
import { Link } from './router.jsx';
import { copyText } from './ui.jsx';
import { downloadReceipt, copyReceiptImage } from './receiptImage.js';

const CHECK = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
const CROSS = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>;

export const receiptUrl = (hash) => `${location.origin}/receipt?tx=${hash}`;
export const receiptPath = (hash) => `/receipt?tx=${hash}`;
const same = (a, b) => a && b && a.toLowerCase() === b.toLowerCase();

// The receipt card. Pure display: give it a title, an amount and a few rows.
export function ReceiptCard({ title, amount, ok = true, rows = [], hash, took, toast }) {
  return (
    <div className="receipt" data-ok={ok ? '1' : '0'}>
      <div className="receipt-top">
        <span className="receipt-brand">Fabrika receipt</span>
        <span className="receipt-no">No. {hash ? hash.slice(2, 10).toUpperCase() : '—'}</span>
      </div>
      <div className="receipt-head">
        <span className="okmark">{ok ? CHECK : CROSS}</span>
        <h2>{title}</h2>
        {amount != null && <div className="receipt-amt">{fmtMon(amount, 6)}<small>MON</small></div>}
        <span className="speed" style={ok ? undefined : { color: 'var(--alert)' }}>
          {ok ? (took ? `Confirmed in ${took}s on Monad` : 'Confirmed on Monad') : 'This transaction failed'}
        </span>
      </div>
      <svg className="receipt-tear" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="2" x2="100" y2="2" /></svg>
      <div>
        {rows.filter(Boolean).map(([k, v]) => (
          <div className="set-row" key={k}><span>{k}</span><span>{v}</span></div>
        ))}
      </div>
      <div className="receipt-actions">
        <button className="btn sm" type="button" onClick={() => downloadReceipt({ title, amount, ok, rows, hash, took }).then(() => toast?.('Receipt saved as image'), () => toast?.('Could not make the image'))}>Download image</button>
        <button className="btn ghost sm" type="button" onClick={() => copyReceiptImage({ title, amount, ok, rows, hash, took }).then((r) => toast?.(r === 'copied' ? 'Image copied' : r === 'shared' ? 'Shared' : 'Saved as image'), (e) => { if (e?.name !== 'AbortError') toast?.('Could not copy. Use Download image.'); })}>Copy image</button>
      </div>
      {hash && (
        <div className="receipt-actions">
          <button className="btn ghost sm" type="button" onClick={() => copyText(receiptUrl(hash), toast)}>Copy receipt link</button>
          <Link className="btn ghost sm" to={receiptPath(hash)}>Open full receipt</Link>
        </div>
      )}
    </div>
  );
}

// /receipt?tx=0x… : anyone with the link can open it. Reads everything from the chain.
export default function ReceiptPage({ toast }) {
  const hash = new URLSearchParams(location.search).get('tx') || '';
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    let live = true;
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) { setState({ error: 'This receipt link is not valid.' }); return undefined; }
    (async () => {
      try {
        const [tx, rc] = await Promise.all([
          publicClient.getTransaction({ hash }),
          publicClient.getTransactionReceipt({ hash }),
        ]);
        const block = await publicClient.getBlock({ blockNumber: rc.blockNumber });
        let kind = 'transfer', amount = tx.value, extra = [];
        if (VAULT && same(tx.to, VAULT)) {
          const d = decodeFunctionData({ abi: vaultAbi, data: tx.input });
          if (d.functionName === 'createBatch') {
            kind = 'batch';
            const n = d.args[1].length;
            extra = [['Recipients', `${n} ${n === 1 ? 'person' : 'people'}`], ['Returns to sender after', fmtDate(d.args[4])]];
          } else {
            // claim / cancel / refund: the amount lives on the allocation
            const a = await publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: 'getAllocation', args: [d.args[0]] });
            amount = a[3];
            kind = d.functionName;
            if (kind === 'claim') extra = [['Paid out to', shortAddr(d.args[1])]];
          }
        } else if (PAY && same(tx.to, PAY)) {
          const d = decodeFunctionData({ abi: payAbi, data: tx.input });
          kind = d.functionName === 'pay' ? 'invoice' : `invoice-${d.functionName}`;
          if (d.functionName === 'pay') {
            const r = await publicClient.readContract({ address: PAY, abi: payAbi, functionName: 'getRequest', args: [d.args[0]] });
            let note = '';
            try { note = await publicClient.readContract({ address: PAY, abi: payAbi, functionName: 'noteOf', args: [d.args[0]] }); } catch { /* note is optional */ }
            extra = [['Paid to', shortAddr(r[0])], note ? ['For', note] : null];
          }
        }
        if (live) setState({ tx, rc, time: Number(block.timestamp), kind, amount, extra });
      } catch (e) {
        if (live) setState({ error: /not found|could not be found/i.test(String(e?.message)) ? 'We cannot find this transaction yet. Wait a moment and refresh.' : cleanError(e) });
      }
    })();
    return () => { live = false; };
  }, [hash]);

  if (state.loading) return <section className="col"><p className="sub">Loading receipt…</p></section>;
  if (state.error) {
    return (
      <section className="col">
        <h1 className="title">Receipt</h1>
        <p className="err" role="alert">{state.error}</p>
        <Link className="btn ghost" to="/account">Back to Account</Link>
      </section>
    );
  }

  const { tx, rc, time, kind, amount, extra } = state;
  const TITLES = {
    transfer: 'Money sent', batch: 'Payment created', claim: 'Payout claimed', cancel: 'Payment cancelled',
    refund: 'Payment returned', invoice: 'Invoice paid', 'invoice-cancel': 'Invoice cancelled', 'invoice-createRequest': 'Invoice created',
  };
  const ok = rc.status === 'success';
  const fee = rc.gasUsed * (rc.effectiveGasPrice ?? 0n);
  const rows = [
    ['Date', new Date(time * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })],
    ['From', shortAddr(tx.from)],
    kind === 'transfer' ? ['To', shortAddr(tx.to)] : null,
    ...extra,
    ['Network fee', `${fmtMon(fee, 6)} MON`],
    ['Network', 'Monad Testnet'],
  ];

  return (
    <section className="col">
      <ReceiptCard
        title={TITLES[kind] || 'Transaction'}
        amount={['invoice-cancel', 'invoice-createRequest'].includes(kind) ? null : amount}
        ok={ok} rows={rows} hash={hash} toast={toast}
      />
      <Link className="btn" to="/account">Back to Account</Link>
      <p className="note" style={{ textAlign: 'center' }}>
        Testnet receipt. Want the raw record? <a href={explorer.tx(hash)} target="_blank" rel="noopener">View on explorer</a>
      </p>
    </section>
  );
}
