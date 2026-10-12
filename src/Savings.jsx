import { useState } from 'react';
import { formatEther } from 'viem';
import { ADDR, savingsAbi } from './abis.js';
import { chainNow } from './chain.js';
import { parseAmount, randomId, cleanNote, fmtMon, shortAddr, fmtDate } from './lib.js';
import { param, ID_RE, read, useTx, useLive, saveMine, loadMine, NotOn, Share, Done, Row, Err, Bar, same, dayEnd, todayStr, parseAddresses } from './kit.jsx';
import { Badge } from './ui.jsx';
import { Link } from './router.jsx';
import Gate from './Gate.jsx';

const pct = (bps) => `${Number(bps) / 100}%`;

export default function Savings({ acct, toast }) {
  if (!ADDR.savings) return <NotOn name="Goal savings" />;
  const id = param('s');
  return id ? <View acct={acct} id={id} toast={toast} /> : <Create acct={acct} toast={toast} />;
}

function Create({ acct, toast }) {
  const [amt, setAmt] = useState('');
  const [goal, setGoal] = useState('');
  const [friends, setFriends] = useState('');
  const [need, setNeed] = useState('1');
  const [by, setBy] = useState('');
  const [made, setMade] = useState(null);
  const [fund, setFund] = useState('');
  const tx = useTx(acct);
  const { data, reload } = useLive(async () => ({
    base: await read(ADDR.savings, savingsAbi, 'baseBps'), boost: await read(ADDR.savings, savingsAbi, 'boostBps'), pool: await read(ADDR.savings, savingsAbi, 'rewards'),
  }), [], 10000);
  const mine = acct.address ? loadMine('savings', acct.address) : [];

  async function submit() {
    const amount = parseAmount(amt);
    const text = cleanNote(goal, 120);
    const { list, bad } = parseAddresses(friends);
    const goalBy = dayEnd(by);
    const n = Number(need);
    if (!amount) return tx.setErr('Enter how much to save, for example 20.');
    if (!text) return tx.setErr('Say what your goal is.');
    if (bad.length) return tx.setErr(`These are not wallet addresses: ${bad.slice(0, 2).join(', ')}`);
    if (list.length < 1 || list.length > 10) return tx.setErr('Add 1 to 10 friend wallet addresses.');
    if (list.some((a) => same(a, acct.address))) return tx.setErr('You cannot verify your own goal. Remove your address.');
    if (!Number.isInteger(n) || n < 1 || n > list.length) return tx.setErr(`Friends needed must be from 1 to ${list.length}.`);
    if (!goalBy || goalBy <= (await chainNow())) return tx.setErr('Pick a goal date in the future.');
    const id = randomId();
    const r = await tx.run('Locking…', (wc) => wc.writeContract({ address: ADDR.savings, abi: savingsAbi, functionName: 'open', args: [id, list, n, BigInt(goalBy), text], value: amount }));
    if (!r) return;
    saveMine('savings', acct.address, { id, title: text, at: Date.now() });
    setMade({ id, text });
  }

  async function addRewards() {
    const a = parseAmount(fund);
    if (!a) return tx.setErr('Enter an amount.');
    const r = await tx.run('Funding…', (wc) => wc.writeContract({ address: ADDR.savings, abi: savingsAbi, functionName: 'fundRewards', value: a }));
    if (r) { toast('Added to rewards'); setFund(''); reload(); }
  }

  if (made) {
    const url = `${location.origin}/save?s=${made.id}`;
    return (
      <Gate acct={acct} title="Goal savings">
        <section className="col">
          <div className="card">
            <Done title="Savings locked" line={made.text} />
            <p className="sub" style={{ margin: 0 }}>Send this link to your friends. When enough of them confirm your goal, your rate goes up.</p>
            <Share url={url} text={`Please confirm my goal when I reach it: ${made.text}.`} toast={toast} />
          </div>
          <button className="btn ghost" type="button" onClick={() => { setMade(null); setAmt(''); setGoal(''); }}>New savings</button>
        </section>
      </Gate>
    );
  }

  return (
    <Gate acct={acct} title="Goal savings">
      <section className="col">
        <div><h1 className="title">Goal savings</h1><p className="sub">Save toward a goal. Your friends confirm it. Your rate goes up.</p></div>
        {data && <p className="callout">Base rate {pct(data.base)} a year. Confirmed goal {pct(data.boost)} a year. Rewards pool: {fmtMon(data.pool)} MON.</p>}
        <div className="card">
          <div className="field"><label htmlFor="v-a">Amount to save (MON)</label><input id="v-a" value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" autoComplete="off" /></div>
          <div className="field"><label htmlFor="v-g">Your goal</label><input id="v-g" value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={120} autoComplete="off" /></div>
          <div className="field"><label htmlFor="v-b">Goal date</label><input id="v-b" type="date" min={todayStr(1)} value={by} onChange={(e) => setBy(e.target.value)} /></div>
          <div className="field"><label htmlFor="v-f">Friends who can confirm (wallet addresses)</label><textarea id="v-f" value={friends} onChange={(e) => setFriends(e.target.value)} /></div>
          <div className="field"><label htmlFor="v-n">How many must confirm</label><input id="v-n" value={need} onChange={(e) => setNeed(e.target.value)} inputMode="numeric" /></div>
          <button className="btn" type="button" onClick={submit} disabled={!!tx.busy || !acct.address}>{tx.busy || 'Lock savings'}</button>
          <Err>{tx.err}</Err>
          <p className="note" style={{ margin: 0 }}>You can take your savings out any time. Yield comes from a rewards pool that people fund. If it runs low, yield is paid up to what is left. Your own money is never part of it.</p>
        </div>
        <div className="card">
          <h3>Fund the rewards pool</h3>
          <p className="sub" style={{ margin: 0 }}>Add MON that pays yield to savers. Anyone can add.</p>
          <div className="field"><label htmlFor="v-r">Amount (MON)</label><input id="v-r" value={fund} onChange={(e) => setFund(e.target.value)} inputMode="decimal" autoComplete="off" /></div>
          <button className="btn ghost" type="button" onClick={addRewards} disabled={!!tx.busy || !acct.address}>{tx.busy || 'Add to rewards'}</button>
        </div>
        {mine.length > 0 && <div className="card"><h3>Your savings</h3>{mine.slice(0, 8).map((m) => <div className="act" key={m.id}><Link className="t" to={`/save?s=${m.id}`}>{m.title}</Link></div>)}</div>}
      </section>
    </Gate>
  );
}

function View({ acct, id, toast }) {
  const tx = useTx(acct);
  const valid = ID_RE.test(id);
  const { data, error, reload } = useLive(async () => {
    if (!valid) return null;
    const me = acct.address || '0x0000000000000000000000000000000000000001';
    const [a, p, goal, vs, y, base, boost] = await Promise.all([
      read(ADDR.savings, savingsAbi, 'getAccount', [id]), read(ADDR.savings, savingsAbi, 'progressOf', [id]),
      read(ADDR.savings, savingsAbi, 'goalOf', [id]), read(ADDR.savings, savingsAbi, 'verifiersOf', [id]),
      read(ADDR.savings, savingsAbi, 'pendingYield', [id]), read(ADDR.savings, savingsAbi, 'baseBps'), read(ADDR.savings, savingsAbi, 'boostBps'),
    ]);
    const done = await Promise.all(vs.map((v) => read(ADDR.savings, savingsAbi, 'hasAttested', [id, v])));
    return { owner: a[0], principal: a[1], goalBy: Number(a[3]), metAt: Number(p[0]), threshold: Number(p[1]), count: Number(p[2]), closed: p[3], goal, verifiers: vs.map((v, i) => ({ addr: v, done: done[i] })), yield: y, base, boost, me };
  }, [id, acct.address], 6000);

  if (!valid) return <section className="col"><p className="err">This link is not valid.</p></section>;
  if (!data) return <section className="col"><p className="note">{error || 'Loading…'}</p></section>;
  if (data.owner === '0x0000000000000000000000000000000000000000') return <section className="col"><p className="err">Nothing found for this link.</p></section>;

  const isOwner = same(acct.address, data.owner);
  const myV = data.verifiers.find((v) => same(v.addr, acct.address));
  const open = !data.closed;
  const late = Date.now() / 1000 > data.goalBy;
  const act = async (label, fn, msg) => { const r = await tx.run(label, fn); if (r) { toast(msg); reload(); } };
  const call = (fn) => (wc) => wc.writeContract({ address: ADDR.savings, abi: savingsAbi, functionName: fn, args: [id] });

  return (
    <section className="col" style={{ paddingBlock: '24px 40px' }}>
      <div className="card">
        <div className="card-head"><h3>Goal savings</h3><Badge>{data.closed ? 'Closed' : data.metAt ? 'Goal confirmed' : late ? 'Goal not confirmed' : 'Saving'}</Badge></div>
        <p className="sub" style={{ margin: 0 }}>{data.goal}</p>
        <div className="slip-amt" style={{ margin: 0 }}>{fmtMon(data.principal)}<small>MON saved</small></div>
        <Row k="Saver" v={isOwner ? 'You' : shortAddr(data.owner)} />
        <Row k="Current rate" v={`${pct(data.metAt ? data.boost : data.base)} a year`} />
        <Row k="Goal date" v={fmtDate(data.goalBy)} />
        <Row k="Yield so far" v={`${Number(formatEther(data.yield)).toFixed(6)} MON`} />
        <Bar value={BigInt(data.count)} max={BigInt(data.threshold)} />
        <p className="note" style={{ margin: 0 }}>{data.count} of {data.threshold} friends have confirmed</p>
        {data.verifiers.map((v) => <Row key={v.addr} k={same(v.addr, acct.address) ? 'You' : shortAddr(v.addr)} v={v.done ? 'Confirmed' : 'Waiting'} />)}

        {open && myV && !myV.done && !late && <button className="btn" type="button" onClick={() => act('Confirming…', call('attest'), 'Confirmed')} disabled={!!tx.busy}>{tx.busy || 'I confirm they reached this goal'}</button>}
        {open && myV && !myV.done && late && <p className="callout">The goal date has passed, so confirmations no longer count.</p>}
        {open && isOwner && <button className="btn" type="button" onClick={() => act('Withdrawing…', call('withdraw'), 'Withdrawn')} disabled={!!tx.busy}>{tx.busy || 'Withdraw savings and yield'}</button>}
        {open && !acct.authenticated && <button className="btn ghost" type="button" onClick={acct.login} disabled={!acct.ready}>Sign in</button>}
        {open && isOwner && <Share url={`${location.origin}/save?s=${id}`} text={`Please confirm my goal when I reach it: ${data.goal}.`} toast={toast} />}
        <Err>{tx.err}</Err>
      </div>
    </section>
  );
}
