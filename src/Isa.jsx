import { useState } from 'react';
import { formatEther } from 'viem';
import { ADDR, isaAbi, ISA_STATUS } from './abis.js';
import { chainNow } from './chain.js';
import { parseAmount, randomId, cleanNote, fmtMon, shortAddr, fmtDate } from './lib.js';
import { param, ID_RE, read, useTx, useLive, saveMine, loadMine, NotOn, Share, Done, Row, Err, Bar, same } from './kit.jsx';
import { Badge } from './ui.jsx';
import { Link } from './router.jsx';
import Gate from './Gate.jsx';

const TERMS = [[1, '1 year'], [2, '2 years'], [3, '3 years'], [5, '5 years']];
const FUND = [['604800', '7 days'], ['1209600', '14 days'], ['2592000', '30 days']];
const YEAR = 365 * 86400;

export default function Isa({ acct, toast }) {
  if (!ADDR.isa) return <NotOn name="Income share" />;
  const id = param('d');
  return id ? <View acct={acct} id={id} toast={toast} /> : <Create acct={acct} toast={toast} />;
}

function Create({ acct, toast }) {
  const [target, setTarget] = useState('');
  const [share, setShare] = useState('10');
  const [cap, setCap] = useState('1.5');
  const [years, setYears] = useState(3);
  const [fundFor, setFundFor] = useState('1209600');
  const [note, setNote] = useState('');
  const [made, setMade] = useState(null);
  const tx = useTx(acct);
  const mine = acct.address ? loadMine('isa', acct.address) : [];

  async function submit() {
    const amount = parseAmount(target);
    const pct = Number(share);
    const mult = Number(cap);
    const text = cleanNote(note, 120);
    if (!amount) return tx.setErr('Enter how much you want to raise, for example 100.');
    if (!(pct >= 1 && pct <= 50)) return tx.setErr('The share must be between 1% and 50%.');
    if (!(mult >= 1 && mult <= 3)) return tx.setErr('The cap must be between 1x and 3x.');
    if (!text) return tx.setErr('Say what the money is for.');
    const id = randomId();
    const fundBy = BigInt((await chainNow()) + Number(fundFor));
    const r = await tx.run('Creating…', (wc) => wc.writeContract({
      address: ADDR.isa, abi: isaAbi, functionName: 'createDeal',
      args: [id, amount, Math.round(pct * 100), Math.round(mult * 10000), fundBy, BigInt(years * YEAR), text],
    }));
    if (!r) return;
    saveMine('isa', acct.address, { id, title: text, at: Date.now() });
    setMade({ id, text, amount, pct, mult, years });
  }

  if (made) {
    const url = `${location.origin}/isa?d=${made.id}`;
    return (
      <Gate acct={acct} title="Income share">
        <section className="col">
          <div className="card">
            <Done title="Ask is live" line={`${formatEther(made.amount)} MON for ${made.text}`} />
            <p className="sub" style={{ margin: 0 }}>Backers get {made.pct}% of income you route through this deal for {made.years} years, up to {made.mult}x what they put in.</p>
            <Share url={url} text={`Back me: ${made.text}. ${made.pct}% of my income for ${made.years} years, capped at ${made.mult}x.`} toast={toast} />
          </div>
          <button className="btn ghost" type="button" onClick={() => { setMade(null); setTarget(''); setNote(''); }}>New ask</button>
        </section>
      </Gate>
    );
  }

  return (
    <Gate acct={acct} title="Income share">
      <section className="col">
        <div><h1 className="title">Raise on your future</h1><p className="sub">Friends fund you now. They get a share of your income later, up to a cap.</p></div>
        <div className="card">
          <div className="field"><label htmlFor="i-t">How much to raise (MON)</label><input id="i-t" value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" placeholder="100" autoComplete="off" /></div>
          <div className="field"><label htmlFor="i-n">What is it for?</label><input id="i-n" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Data science bootcamp" maxLength={120} autoComplete="off" /></div>
          <div className="row">
            <div className="field"><label htmlFor="i-s">Share of income (%)</label><input id="i-s" value={share} onChange={(e) => setShare(e.target.value)} inputMode="decimal" /></div>
            <div className="field"><label htmlFor="i-c">Cap (times funded)</label><input id="i-c" value={cap} onChange={(e) => setCap(e.target.value)} inputMode="decimal" /></div>
          </div>
          <div className="row">
            <div className="field"><label htmlFor="i-y">Share lasts</label><select id="i-y" value={years} onChange={(e) => setYears(Number(e.target.value))}>{TERMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div className="field"><label htmlFor="i-f">Funding open for</label><select id="i-f" value={fundFor} onChange={(e) => setFundFor(e.target.value)}>{FUND.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          </div>
          <button className="btn" type="button" onClick={submit} disabled={!!tx.busy || !acct.address}>{tx.busy || 'Publish my ask'}</button>
          <Err>{tx.err}</Err>
          <p className="note" style={{ margin: 0 }}>The money only moves if the full amount is raised. Otherwise backers get it all back.</p>
        </div>
        {mine.length > 0 && <div className="card"><h3>Your asks</h3>{mine.slice(0, 8).map((m) => <div className="act" key={m.id}><Link className="t" to={`/isa?d=${m.id}`}>{m.title}</Link></div>)}</div>}
      </section>
    </Gate>
  );
}

function View({ acct, id, toast }) {
  const [amt, setAmt] = useState('');
  const [income, setIncome] = useState('');
  const tx = useTx(acct);
  const valid = ID_RE.test(id);
  const { data, error, reload } = useLive(async () => {
    if (!valid) return null;
    const me = acct.address || '0x0000000000000000000000000000000000000001';
    const [d, t, note, b] = await Promise.all([
      read(ADDR.isa, isaAbi, 'getDeal', [id]), read(ADDR.isa, isaAbi, 'termsOf', [id]),
      read(ADDR.isa, isaAbi, 'noteOf', [id]), read(ADDR.isa, isaAbi, 'backerInfo', [id, me]),
    ]);
    return { beneficiary: d[0], target: d[1], raised: d[2], repaid: d[3], status: Number(d[4]), share: Number(t[0]) / 100, cap: Number(t[1]) / 10000, fundBy: Number(t[2]), termEnd: Number(t[3]), note, funded: b[0], claimable: b[1], claimed: b[2] };
  }, [id, acct.address], 6000);

  if (!valid) return <section className="col"><p className="err">This link is not valid.</p></section>;
  if (!data) return <section className="col"><p className="note">{error || 'Loading…'}</p></section>;
  if (data.status === 0) return <section className="col"><p className="err">Nothing found for this link.</p></section>;

  const isOwner = same(acct.address, data.beneficiary);
  const call = (fn, args = [], value) => (wc) => wc.writeContract({ address: ADDR.isa, abi: isaAbi, functionName: fn, args, value });
  const act = async (label, fn, msg) => { const r = await tx.run(label, fn); if (r) { toast(msg); reload(); } };
  const left = data.target - data.raised;
  const fundAmt = parseAmount(amt);
  const incomeAmt = parseAmount(income);
  const canRefund = (data.status === 3 || data.status === 4) && data.funded > 0n;

  return (
    <section className="col" style={{ paddingBlock: '24px 40px' }}>
      <div className="card">
        <div className="card-head"><h3>Income share</h3><Badge>{ISA_STATUS[data.status]}</Badge></div>
        <p className="sub" style={{ margin: 0 }}>{data.note}</p>
        <div className="slip-amt" style={{ margin: 0 }}>{fmtMon(data.raised)}<small>of {fmtMon(data.target)} MON</small></div>
        <Bar value={data.raised} max={data.target} />
        <Row k="Asking" v={isOwner ? 'You' : shortAddr(data.beneficiary)} />
        <Row k="Backers get" v={`${data.share}% of income`} />
        <Row k="Capped at" v={`${data.cap}x what they put in`} />
        {data.status === 1 && <Row k="Funding closes" v={fmtDate(data.fundBy)} />}
        {data.status === 2 && <><Row k="Share ends" v={fmtDate(data.termEnd)} /><Row k="Paid to backers so far" v={`${fmtMon(data.repaid)} MON`} /></>}

        {data.status === 1 && !isOwner && (
          !acct.authenticated ? <button className="btn" type="button" onClick={acct.login} disabled={!acct.ready}>Sign in to back this</button> : (
            <>
              <div className="field"><label htmlFor="i-a">Your amount (MON, up to {formatEther(left)})</label><input id="i-a" value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" autoComplete="off" /></div>
              <button className="btn" type="button" onClick={() => (fundAmt && fundAmt <= left ? act('Backing…', call('fund', [id], fundAmt), 'You backed this') : tx.setErr('Enter an amount up to what is still needed.'))} disabled={!!tx.busy || !acct.address}>{tx.busy || 'Back this'}</button>
            </>
          )
        )}
        {data.status === 1 && isOwner && <button className="btn ghost" type="button" onClick={() => act('Cancelling…', call('cancel', [id]), 'Cancelled')} disabled={!!tx.busy}>{tx.busy || 'Cancel this ask'}</button>}
        {canRefund && <button className="btn" type="button" onClick={() => act('Refunding…', call('refundFunding', [id]), 'Money returned')} disabled={!!tx.busy}>{tx.busy || `Take back my ${formatEther(data.funded)} MON`}</button>}

        {data.funded > 0n && data.status === 2 && (
          <>
            <Row k="You backed" v={`${fmtMon(data.funded)} MON`} />
            <Row k="You can collect" v={`${fmtMon(data.claimable)} MON`} />
            <Row k="You collected" v={`${fmtMon(data.claimed)} MON`} />
            <button className="btn" type="button" onClick={() => act('Collecting…', call('claimReturns', [id]), 'Collected')} disabled={!!tx.busy || data.claimable === 0n}>{tx.busy || 'Collect my share'}</button>
          </>
        )}

        {data.status === 2 && acct.authenticated && (
          <>
            <div className="field"><label htmlFor="i-p">Pay income into this deal (MON)</label><input id="i-p" value={income} onChange={(e) => setIncome(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="20" /></div>
            <button className="btn ghost" type="button" onClick={() => (incomeAmt ? act('Paying…', call('payIncome', [id], incomeAmt), 'Income split') : tx.setErr('Enter an amount.'))} disabled={!!tx.busy || !acct.address}>{tx.busy || 'Pay income'}</button>
            <p className="note" style={{ margin: 0 }}>Anyone can pay in: an employer, a client, or {isOwner ? 'you' : 'the person you backed'}. The split happens in the same transaction.</p>
          </>
        )}
        {data.status === 2 && isOwner && <p className="callout">Only income you route through this page is shared. Backers are trusting you to do that.</p>}
        <Share url={`${location.origin}/isa?d=${id}`} text={`Income share: ${data.note}.`} toast={toast} />
        <Err>{tx.err}</Err>
      </div>
    </section>
  );
}
