import { useState } from 'react';
import { formatEther } from 'viem';
import { ADDR, coverAbi, COVER_PHASE } from './abis.js';
import { monadTestnet } from './chain.js';
import { parseAmount, randomId, fmtMon, shortAddr, fmtDate } from './lib.js';
import { param, ID_RE, read, useTx, useLive, saveMine, loadMine, NotOn, Share, Done, Row, Err, same, nowSec, span, useTick } from './kit.jsx';
import { Badge } from './ui.jsx';
import { Link } from './router.jsx';
import Gate from './Gate.jsx';

const LEN = [[15, '15 minutes'], [60, '1 hour'], [180, '3 hours'], [1440, '1 day'], [10080, '7 days']];

export default function Cover({ acct, toast }) {
  if (!ADDR.cover) return <NotOn name="Cover by the minute" />;
  const id = param('c');
  return id ? <Policy acct={acct} id={id} toast={toast} /> : <Home acct={acct} toast={toast} />;
}

function Home({ acct, toast }) {
  const [tab, setTab] = useState('buy');
  return (
    <Gate acct={acct} title="Cover">
      <section className="col">
        <div><h1 className="title">Cover by the minute</h1><p className="sub">Insure a thing for the hours you need. Or earn premiums by backing the pool.</p></div>
        <div className="seg" role="tablist" aria-label="Cover">
          <button type="button" role="tab" aria-selected={tab === 'buy'} onClick={() => setTab('buy')}>Get cover</button>
          <button type="button" role="tab" aria-selected={tab === 'under'} onClick={() => setTab('under')}>Back the pool</button>
        </div>
        {tab === 'buy' ? <Buy acct={acct} toast={toast} /> : <Underwrite acct={acct} toast={toast} />}
      </section>
    </Gate>
  );
}

function Buy({ acct, toast }) {
  const [cover, setCover] = useState('');
  const [mins, setMins] = useState(180);
  const [label, setLabel] = useState('');
  const [made, setMade] = useState(null);
  const tx = useTx(acct);
  const amount = parseAmount(cover);
  const { data } = useLive(async () => ({
    cap: await read(ADDR.cover, coverAbi, 'capacity'),
    premium: amount ? await read(ADDR.cover, coverAbi, 'quote', [amount, BigInt(mins)]) : null,
  }), [cover, mins], 8000);
  const mine = acct.address ? loadMine('cover', acct.address) : [];

  async function buy() {
    if (!amount) return tx.setErr('Enter the amount to cover, for example 50.');
    if (!data?.premium) return tx.setErr('Could not get a price. Try again.');
    if (data.cap < amount) return tx.setErr('The pool cannot cover that much right now. Try a smaller amount.');
    const id = randomId();
    const r = await tx.run('Buying…', (wc) => wc.writeContract({ address: ADDR.cover, abi: coverAbi, functionName: 'buy', args: [id, amount, BigInt(mins)], value: data.premium }));
    if (!r) return;
    saveMine('cover', acct.address, { id, title: `${label.trim() || 'Cover'}: ${formatEther(amount)} MON`, at: Date.now() });
    setMade({ id });
    toast('You are covered');
  }

  if (made) {
    return (
      <div className="card">
        <Done title="You are covered" line={`${formatEther(amount)} MON for ${LEN.find((l) => l[0] === mins)?.[1]}`} />
        <Link className="btn" to={`/cover?c=${made.id}`}>See my cover</Link>
        <button className="btn ghost" type="button" onClick={() => { setMade(null); setCover(''); }}>Buy another</button>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <div className="field"><label htmlFor="c-a">Amount to cover (MON)</label><input id="c-a" value={cover} onChange={(e) => setCover(e.target.value)} inputMode="decimal" placeholder="50" autoComplete="off" /></div>
        <div className="field"><label htmlFor="c-l">For how long</label><select id="c-l" value={mins} onChange={(e) => setMins(Number(e.target.value))}>{LEN.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="field"><label htmlFor="c-n">What is covered (for you)</label><input id="c-n" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Laptop at the cafe" maxLength={40} autoComplete="off" /></div>
        {data?.premium != null && <p className="callout">Price: {formatEther(data.premium)} MON. You pay only for these minutes.</p>}
        {data && <p className="note" style={{ margin: 0 }}>The pool can cover up to {fmtMon(data.cap)} MON right now.</p>}
        <button className="btn" type="button" onClick={buy} disabled={!!tx.busy || !acct.address || !data?.premium}>{tx.busy || 'Buy cover'}</button>
        <Err>{tx.err}</Err>
        <p className="note" style={{ margin: 0 }}>If something goes wrong, you file a claim. A reviewer called the adjudicator signs it and the pool pays you, up to your covered amount.</p>
      </div>
      {mine.length > 0 && <div className="card"><h3>Your cover</h3>{mine.slice(0, 8).map((m) => <div className="act" key={m.id}><Link className="t" to={`/cover?c=${m.id}`}>{m.title}</Link></div>)}</div>}
    </>
  );
}

function Underwrite({ acct, toast }) {
  const [amt, setAmt] = useState('');
  const tx = useTx(acct);
  const { data, reload } = useLive(async () => {
    const [assets, cap, pos, shares] = await Promise.all([
      read(ADDR.cover, coverAbi, 'assets'), read(ADDR.cover, coverAbi, 'capacity'),
      read(ADDR.cover, coverAbi, 'positionOf', [acct.address]), read(ADDR.cover, coverAbi, 'sharesOf', [acct.address]),
    ]);
    return { assets, cap, value: pos[0], free: pos[1], shares };
  }, [acct.address], 8000);
  const amount = parseAmount(amt);

  async function put() {
    if (!amount) return tx.setErr('Enter an amount, for example 20.');
    const r = await tx.run('Depositing…', (wc) => wc.writeContract({ address: ADDR.cover, abi: coverAbi, functionName: 'deposit', value: amount }));
    if (r) { toast('Added to the pool'); setAmt(''); reload(); }
  }
  async function take(pct) {
    if (!data || data.shares === 0n) return;
    let shares = (data.shares * BigInt(pct)) / 100n;
    if (data.value > 0n && data.free < data.value) shares = (data.shares * data.free) / data.value;
    if (shares === 0n) return tx.setErr('Nothing can leave right now. Funds are reserved for active cover.');
    const r = await tx.run('Withdrawing…', (wc) => wc.writeContract({ address: ADDR.cover, abi: coverAbi, functionName: 'withdraw', args: [shares] }));
    if (r) { toast('Withdrawn'); reload(); }
  }

  return (
    <div className="card">
      <p className="sub" style={{ margin: 0 }}>You earn the premiums people pay. You lose money if claims are bigger than the premiums.</p>
      {data && <><Row k="Pool size" v={`${fmtMon(data.assets)} MON`} /><Row k="Your share is worth" v={`${fmtMon(data.value)} MON`} /><Row k="You can take out now" v={`${fmtMon(data.free)} MON`} /></>}
      <div className="field"><label htmlFor="u-a">Add to the pool (MON)</label><input id="u-a" value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" placeholder="20" autoComplete="off" /></div>
      <button className="btn" type="button" onClick={put} disabled={!!tx.busy || !acct.address}>{tx.busy || 'Add to pool'}</button>
      {data && data.shares > 0n && <div className="actions"><button className="btn ghost" type="button" onClick={() => take(50)} disabled={!!tx.busy}>Take out half</button><button className="btn ghost" type="button" onClick={() => take(100)} disabled={!!tx.busy}>Take out all</button></div>}
      <Err>{tx.err}</Err>
    </div>
  );
}

function Policy({ acct, id, toast }) {
  const [payout, setPayout] = useState('');
  const [sig, setSig] = useState('');
  const [dl, setDl] = useState('');
  const [made, setMade] = useState('');
  const tx = useTx(acct);
  const valid = ID_RE.test(id);
  const { data, error, reload } = useLive(async () => {
    if (!valid) return null;
    const [p, adj] = await Promise.all([read(ADDR.cover, coverAbi, 'getPolicy', [id]), read(ADDR.cover, coverAbi, 'adjudicator')]);
    return { insured: p[0], cover: p[1], start: Number(p[2]), end: Number(p[3]), settled: p[4], phase: Number(p[5]), adj };
  }, [id], 8000);
  useTick(!!data && data.phase === 1);

  if (!valid) return <section className="col"><p className="err">This link is not valid.</p></section>;
  if (!data) return <section className="col"><p className="note">{error || 'Loading…'}</p></section>;
  if (data.phase === 0) return <section className="col"><p className="err">No cover found for this link.</p></section>;

  const isInsured = same(acct.address, data.insured);
  const isAdj = same(acct.address, data.adj);
  const left = data.end - nowSec();
  const claimable = data.phase === 1 || data.phase === 2;

  async function sign() {
    const p = parseAmount(payout);
    if (!p || p > data.cover) return tx.setErr(`Enter a payout up to ${formatEther(data.cover)} MON.`);
    try {
      const wc = await acct.getClient();
      const deadline = BigInt(nowSec() + 3 * 86400);
      const signature = await wc.signTypedData({
        account: acct.address,
        domain: { name: 'FabrikaCover', version: '1', chainId: monadTestnet.id, verifyingContract: ADDR.cover },
        types: { Claim: [{ name: 'policyId', type: 'bytes32' }, { name: 'insured', type: 'address' }, { name: 'payout', type: 'uint256' }, { name: 'deadline', type: 'uint256' }] },
        primaryType: 'Claim',
        message: { policyId: id, insured: data.insured, payout: p, deadline },
      });
      setMade(JSON.stringify({ payout: formatEther(p), deadline: deadline.toString(), signature }));
    } catch { tx.setErr('Signing was cancelled.'); }
  }

  async function submit() {
    let o;
    try { o = JSON.parse(sig); } catch { o = null; }
    const p = parseAmount(o?.payout ?? payout);
    if (!o?.signature || !o?.deadline || !p) return tx.setErr('Paste the full approval you were sent.');
    const r = await tx.run('Claiming…', (wc) => wc.writeContract({ address: ADDR.cover, abi: coverAbi, functionName: 'claim', args: [id, p, BigInt(o.deadline), o.signature] }));
    if (r) { toast('Claim paid'); reload(); }
  }

  return (
    <section className="col" style={{ paddingBlock: '24px 40px' }}>
      <div className="card">
        <div className="card-head"><h3>Cover</h3><Badge>{COVER_PHASE[data.phase]}</Badge></div>
        <div className="slip-amt" style={{ margin: 0 }}>{fmtMon(data.cover)}<small>MON covered</small></div>
        <Row k="Covered person" v={isInsured ? 'You' : shortAddr(data.insured)} />
        <Row k="Started" v={fmtDate(data.start)} />
        <Row k="Ends" v={fmtDate(data.end)} />
        {data.phase === 1 && left > 0 && <Row k="Time left" v={span(left)} />}
        {data.phase === 4 && <p className="callout">This cover is closed.</p>}

        {claimable && isInsured && (
          <>
            <p className="callout">Something went wrong? Send your adjudicator the link to this page and what happened. When they approve, paste their approval below.</p>
            <Share url={`${location.origin}/cover?c=${id}`} text="I need to file a claim on this cover:" toast={toast} />
            <div className="field"><label htmlFor="cl-s">Approval from the adjudicator</label><textarea id="cl-s" value={sig} onChange={(e) => setSig(e.target.value)} placeholder='{"payout":"…","deadline":"…","signature":"0x…"}' /></div>
            <button className="btn" type="button" onClick={submit} disabled={!!tx.busy}>{tx.busy || 'Submit claim'}</button>
          </>
        )}
        {claimable && isAdj && (
          <>
            <p className="callout">You are the adjudicator. If the loss is real, approve a payout and send the result to the covered person.</p>
            <div className="field"><label htmlFor="cl-p">Payout (MON, up to {formatEther(data.cover)})</label><input id="cl-p" value={payout} onChange={(e) => setPayout(e.target.value)} inputMode="decimal" autoComplete="off" /></div>
            <button className="btn" type="button" onClick={sign} disabled={!!tx.busy}>Approve claim</button>
            {made && <><code className="callout" style={{ overflowWrap: 'anywhere' }}>{made}</code><button className="btn ghost" type="button" onClick={() => { navigator.clipboard?.writeText(made); toast('Copied'); }}>Copy approval</button></>}
          </>
        )}
        <Err>{tx.err}</Err>
      </div>
    </section>
  );
}
