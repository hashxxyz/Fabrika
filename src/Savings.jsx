import { useState } from 'react';
import { BalanceEye, useHideBalance } from './ui.jsx';
import { ADDR, savingsAbi } from './abis.js';
import { chainNow, FAUCET } from './chain.js';
import { parseAmount, randomId, cleanNote, fmtMon, shortAddr } from './lib.js';
import { param, ID_RE, read, useTx, useLive, saveMine, loadMine, NotOn, Share, Done, Row, Err, Bar, same, dayEnd, todayStr } from './kit.jsx';
import { Link } from './router.jsx';
import Gate from './Gate.jsx';

// Goals no longer ask for friends. The contract still needs one verifier, so every new goal names this
// address, which nobody controls. The confirmed rate can then never be reached and the goal earns the base rate.
const NOBODY = '0x000000000000000000000000000000000000dead';
const isPlain = (vs) => vs.length === 1 && String(vs[0]).toLowerCase() === NOBODY;
const pct = (bps) => `${Number(bps) / 100}%`;
const svg = (d) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const LOCK = svg(<><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 018 0v3" /></>);
const ARROW = svg(<path d="M5 12h14M13 6l6 6-6 6" />);
const TREND = svg(<path d="M3 17l6-6 4 4 8-8M15 7h6v6" />);
const PLUS = svg(<><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>);
const dateOf = (sec) => new Date(sec * 1000).toLocaleDateString(undefined, { dateStyle: 'medium' });
const daysLeft = (sec) => Math.max(0, Math.ceil((sec * 1000 - Date.now()) / 86400000));

// Where a goal stands, in plain words. tone drives the pill colour.
function statusOf(g) {
  if (g.closed) return { text: 'Withdrawn', tone: 'done' };
  if (g.metAt) return { text: 'Goal confirmed', tone: 'good' };
  if (Date.now() / 1000 > g.goalBy) return g.plain ? { text: 'Ready to withdraw', tone: 'good' } : { text: 'Date passed', tone: 'late' };
  return { text: 'Saving', tone: 'saving' };
}

export default function Savings({ acct, toast }) {
  if (!ADDR.savings) return <NotOn name="Goal savings" />;
  const id = param('s');
  if (id) return <View acct={acct} id={id} toast={toast} />;
  return (
    <Gate acct={acct} title="Goal savings">
      {param('new') ? <Create acct={acct} toast={toast} /> : <Hub acct={acct} toast={toast} />}
    </Gate>
  );
}

/* ---------------------------------------------------------------- Hub */

function Hub({ acct, toast }) {
  const [past, setPast] = useState(false);
  const { hidden, toggle } = useHideBalance();
  const mask = (s) => (hidden ? '••••' : s);
  const mine = loadMine('savings', acct.address);
  const key = mine.map((m) => m.id).join(',');
  const { data, error, reload } = useLive(async () => {
    const [base, boost, pool] = await Promise.all([
      read(ADDR.savings, savingsAbi, 'baseBps'), read(ADDR.savings, savingsAbi, 'boostBps'), read(ADDR.savings, savingsAbi, 'rewards'),
    ]);
    const goals = await Promise.all(mine.map(async (m) => {
      try {
        const [a, p, y, vs] = await Promise.all([
          read(ADDR.savings, savingsAbi, 'getAccount', [m.id]), read(ADDR.savings, savingsAbi, 'progressOf', [m.id]), read(ADDR.savings, savingsAbi, 'pendingYield', [m.id]), read(ADDR.savings, savingsAbi, 'verifiersOf', [m.id]),
        ]);
        return { id: m.id, title: m.title, principal: a[1], goalBy: Number(a[3]), metAt: Number(p[0]), closed: p[3], yield: y, plain: isPlain(vs) };
      } catch { return null; }
    }));
    return { base, boost, pool, goals: goals.filter(Boolean) };
  }, [key, acct.address], 10000);

  const active = (data?.goals || []).filter((g) => !g.closed);
  const old = (data?.goals || []).filter((g) => g.closed);
  const total = active.reduce((s, g) => s + g.principal, 0n);
  const earned = active.reduce((s, g) => s + g.yield, 0n);
  const shown = past ? old : active;

  return (
    <section className="col">
      <div>
        <h1 className="title">Goal savings</h1>
        <p className="sub">Lock MON toward a goal and earn yield. Take it out any time.</p>
      </div>

      <div className="balcard">
        <div className="balrow"><div className="k">Total saved</div><BalanceEye hidden={hidden} onToggle={toggle} /></div>
        <div className="big"><span aria-label={hidden ? 'Balance hidden' : undefined}>{data ? mask(fmtMon(total)) : '…'}</span><small>MON</small></div>
        <div className="sv-note">Take it out any time. Your own money is never used to pay yield.</div>
      </div>

      <div className="sv-row">
        <span className="sv-ico">{TREND}</span>
        <span className="sv-label">Yield so far</span>
        <b className="pos">+{data ? mask(fmtMon(earned, 6)) : '0'} MON</b>
      </div>

      {data && <div className="sv-rates"><span className="sv-pill" data-tone="good">{pct(data.base)} a year</span></div>}
      {error && !data && <p className="err" role="alert">{error}</p>}

      <div className="sv-head">
        <h2>{past ? 'Past goals' : 'Active goals'}</h2>
        {(old.length > 0 || past) && <button className="sv-link" type="button" onClick={() => setPast(!past)}>{past ? 'Back to active' : 'View past goals'}</button>}
      </div>

      {!data && !error && <div className="sv-goal sv-skel" aria-busy="true"><i /><i /><i /></div>}
      {data && !shown.length && (
        <div className="card">
          <b>{past ? 'No past goals' : 'No goals yet'}</b>
          <p className="note" style={{ margin: 0 }}>{past ? 'Goals you withdraw show up here.' : 'Lock some MON and name your goal.'}</p>
        </div>
      )}
      {shown.map((g) => {
        const st = statusOf(g);
        return (
          <Link className="sv-goal" to={`/save?s=${g.id}`} key={g.id}>
            <span className="ic">{LOCK}</span>
            <span className="mid"><span className="nm">{g.title}</span><span className="am">{mask(fmtMon(g.principal))} MON</span></span>
            <span className="go">{ARROW}</span>
            <span className="ft">
              <span>{g.closed ? 'Closed' : `Ends ${dateOf(g.goalBy)} (${daysLeft(g.goalBy)} ${daysLeft(g.goalBy) === 1 ? 'day' : 'days'})`}</span>
              <span className="sv-pill" data-tone={st.tone}>{st.text}</span>
            </span>
          </Link>
        );
      })}

      <Link className="btn sv-create" to="/save?new=1">{PLUS}Create a new goal</Link>

      <h2 className="sv-h2">More</h2>
      <RewardsCard acct={acct} toast={toast} pool={data?.pool} onDone={reload} />
      <div className="faq">
        <details><summary>Can I take my money out?</summary><p>Yes, any time. Withdrawing sends back your savings plus the yield earned so far and closes that goal.</p></details>
        <details><summary>Where does the yield come from?</summary><p>From a rewards pool that people fund. If it runs low, yield is paid up to what is left.</p></details>
      </div>
    </section>
  );
}

function RewardsCard({ acct, toast, pool, onDone }) {
  const [fund, setFund] = useState('');
  const tx = useTx(acct);
  async function add() {
    const a = parseAmount(fund);
    if (!a) return tx.setErr('Enter an amount.');
    const r = await tx.run('Adding…', (wc) => wc.writeContract({ address: ADDR.savings, abi: savingsAbi, functionName: 'fundRewards', value: a }));
    if (r) { toast('Added to rewards'); setFund(''); onDone(); }
  }
  return (
    <div className="card">
      <div className="card-head"><h3>Rewards pool</h3><b className="sv-amt">{pool == null ? '…' : fmtMon(pool)} MON</b></div>
      <p className="note" style={{ margin: 0 }}>Pays yield to savers. Anyone can add MON.</p>
      <div className="field"><label htmlFor="v-r">Amount to add (MON)</label><input id="v-r" value={fund} onChange={(e) => setFund(e.target.value)} inputMode="decimal" autoComplete="off" /></div>
      <button className="btn ghost" type="button" onClick={add} disabled={!!tx.busy || !acct.address}>{tx.busy || 'Add to rewards'}</button>
      <Err>{tx.err}</Err>
    </div>
  );
}

/* ---------------------------------------------------------------- Create */

const DURATIONS = [7, 30, 60, 90, 180, 365];
// Interest for `days` at an annual rate in basis points. Same maths as the contract (365-day year).
const earn = (amount, bps, days) => (amount * BigInt(bps) * BigInt(days)) / (10000n * 365n);

function Create({ acct, toast }) {
  const [step, setStep] = useState(1);
  const [amt, setAmt] = useState('');
  const [days, setDays] = useState(90);
  const [custom, setCustom] = useState(false);
  const [by, setBy] = useState('');
  const [goal, setGoal] = useState('');
  const [made, setMade] = useState(null);
  const tx = useTx(acct);
  const { data } = useLive(async () => ({
    base: await read(ADDR.savings, savingsAbi, 'baseBps'), boost: await read(ADDR.savings, savingsAbi, 'boostBps'),
  }), [], 20000);

  const amount = parseAmount(amt);
  const goalBy = custom ? dayEnd(by) : dayEnd(todayStr(days));
  const nDays = custom ? Math.max(0, Math.ceil((goalBy * 1000 - Date.now()) / 86400000)) : days;
  const short = !!amount && acct.balance != null && acct.balance < amount;
  const base = data && amount && nDays ? earn(amount, data.base, nDays) : null;

  function next() {
    tx.setErr('');
    if (!amount) return tx.setErr('Enter how much to lock, for example 20.');
    if (!goalBy || goalBy * 1000 <= Date.now()) return tx.setErr('Pick an end date in the future.');
    if (short) return tx.setErr('Your balance is lower than this amount. Add funds or lock less.');
    setStep(2);
  }

  async function submit() {
    const text = cleanNote(goal, 120);
    if (!text) return tx.setErr('Say what your goal is.');
    if (!goalBy || goalBy <= (await chainNow())) return tx.setErr('Pick an end date in the future.');
    const id = randomId();
    const r = await tx.run('Locking…', (wc) => wc.writeContract({ address: ADDR.savings, abi: savingsAbi, functionName: 'open', args: [id, [NOBODY], 1, BigInt(goalBy), text], value: amount }));
    if (!r) return;
    saveMine('savings', acct.address, { id, title: text, at: Date.now() });
    setMade({ id, text });
  }

  if (made) {
    return (
      <section className="col">
        <div className="card">
          <Done title="Savings locked" line={made.text} />
          <p className="sub" style={{ margin: 0 }}>Your MON is locked toward this goal. You can withdraw any time.</p>
        </div>
        <Link className="btn ghost" to={`/save?s=${made.id}`}>View this goal</Link>
      </section>
    );
  }

  if (step === 2) {
    return (
      <section className="col">
        <div>
          <h1 className="title">What are you saving for?</h1>
          <p className="sub">Give your goal a name. You can withdraw any time.</p>
        </div>
        <div className="card">
          <Row k="Locking" v={`${fmtMon(amount)} MON`} />
          <Row k="Until" v={`${dateOf(goalBy)} (${nDays} days)`} />
          {data && <Row k="Rate" v={`${pct(data.base)} a year`} />}
        </div>
        <div className="card">
          <div className="field"><label htmlFor="v-g">What are you saving for?</label><input id="v-g" value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={120} autoComplete="off" /></div>
          <Err>{tx.err}</Err>
          <button className="btn" type="button" onClick={submit} disabled={!!tx.busy || !acct.address}>{tx.busy || 'Lock savings'}</button>
          <button className="btn ghost" type="button" onClick={() => { tx.setErr(''); setStep(1); }} disabled={!!tx.busy}>Change amount or date</button>
        </div>
      </section>
    );
  }

  return (
    <section className="col">
      <h1 className="title">Lock funds</h1>

      <div className="lk-block">
        <label className="lk-q" htmlFor="lk-a">How much do you want to lock?</label>
        <div className="lk-amt">
          <input id="lk-a" value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" autoComplete="off" placeholder="0" />
          <small>MON</small>
        </div>
        {amount && base != null && (
          <p className="lk-hint">
            {short ? 'Add funds to lock this and ' : 'You will '}earn about <b>{fmtMon(base, 6)} MON</b> after {nDays} days.
            {short && <> <a href={FAUCET} target="_blank" rel="noopener">Add funds</a></>}
          </p>
        )}
      </div>

      <div className="lk-block">
        <h2 className="lk-q">For how long?</h2>
        <div className="lk-days">
          {DURATIONS.map((d) => (
            <button key={d} className="lk-day" type="button" aria-pressed={!custom && days === d} onClick={() => { setCustom(false); setDays(d); }}>
              <b>{d} days</b>
              <span>{amount && data ? `+${fmtMon(earn(amount, data.base, d), 4)} MON` : data ? `${pct(data.base)} p.a` : '…'}</span>
            </button>
          ))}
        </div>
        {custom ? (
          <div className="field">
            <label htmlFor="v-b">End date</label>
            <input id="v-b" type="date" min={todayStr(1)} value={by} onChange={(e) => setBy(e.target.value)} />
          </div>
        ) : (
          <button className="sv-link lk-own" type="button" onClick={() => setCustom(true)}>Pick your own end date</button>
        )}
        {custom && <button className="sv-link lk-own" type="button" onClick={() => setCustom(false)}>Use a set length instead</button>}
      </div>

      <div className="card">
        <div className="sumrow"><span>Interest to earn</span><b className="sv-pos">+{base == null ? '0' : fmtMon(base, 6)} MON</b></div>
        {data && <p className="note" style={{ margin: 0 }}>At {pct(data.base)} a year.</p>}
      </div>

      <div className="lk-from">
        <span className="sv-ico">{LOCK}</span>
        <div>
          <div className="lk-from-k">Moving from</div>
          <b>Your Fabrika balance</b>
          <div className={'lk-from-bal' + (short ? ' bad' : '')}>{acct.balance == null ? '…' : `${fmtMon(acct.balance)} MON`}{short && ' · Not enough balance'}</div>
        </div>
        {short && <a className="sv-link" href={FAUCET} target="_blank" rel="noopener">Add funds</a>}
      </div>

      <Err>{tx.err}</Err>
      <button className="btn" type="button" onClick={next} disabled={!amount || short}>Continue</button>
      <p className="note" style={{ margin: 0 }}>You can withdraw any time. Yield comes from a rewards pool that people fund. If it runs low, yield is paid up to what is left. Your own money is never part of it.</p>
    </section>
  );
}

/* ---------------------------------------------------------------- Goal detail */

function View({ acct, id, toast }) {
  const tx = useTx(acct);
  const { hidden, toggle } = useHideBalance();
  const mask = (s) => (hidden ? '••••' : s);
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
  const plain = isPlain(data.verifiers.map((v) => v.addr));
  const st = statusOf({ closed: data.closed, metAt: data.metAt, goalBy: data.goalBy, plain });
  const act = async (label, fn, msg) => { const r = await tx.run(label, fn); if (r) { toast(msg); reload(); } };
  const call = (fn) => (wc) => wc.writeContract({ address: ADDR.savings, abi: savingsAbi, functionName: fn, args: [id] });
  const link = `${location.origin}/save?s=${id}`;

  return (
    <section className="col">
      <div className="balcard">
        <div className="balrow"><div className="k">{data.goal}</div><span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><span className="sv-pill sv-on-dark" data-tone={st.tone}>{st.text}</span><BalanceEye hidden={hidden} onToggle={toggle} /></span></div>
        <div className="big"><span aria-label={hidden ? 'Balance hidden' : undefined}>{mask(fmtMon(data.principal))}</span><small>MON saved</small></div>
        <div className="sv-note">{isOwner ? 'Your goal' : `Saved by ${shortAddr(data.owner)}`} · ends {dateOf(data.goalBy)}{open ? ` (${daysLeft(data.goalBy)} days)` : ''}</div>
      </div>

      <div className="sv-row">
        <span className="sv-ico">{TREND}</span>
        <span className="sv-label">Yield so far</span>
        <b className="pos">+{mask(fmtMon(data.yield, 6))} MON</b>
      </div>

      {plain && <p className="note" style={{ margin: 0 }}>Earning {pct(data.base)} a year.</p>}

      {!plain && <div className="card">
        <div className="card-head"><h3>Friend confirmations</h3><b className="sv-amt">{data.count} of {data.threshold}</b></div>
        <Bar value={BigInt(data.count)} max={BigInt(data.threshold)} />
        <div>
          {data.verifiers.map((v) => <Row key={v.addr} k={same(v.addr, acct.address) ? 'You' : shortAddr(v.addr)} v={v.done ? 'Confirmed' : 'Waiting'} />)}
        </div>
        <p className="note" style={{ margin: 0 }}>Current rate: {pct(data.metAt ? data.boost : data.base)} a year. Confirmed goals earn {pct(data.boost)}.</p>
      </div>}

      {open && myV && !myV.done && !late && <button className="btn" type="button" onClick={() => act('Confirming…', call('attest'), 'Confirmed')} disabled={!!tx.busy}>{tx.busy || 'I confirm they reached this goal'}</button>}
      {open && myV && !myV.done && late && <p className="callout">The goal date has passed, so confirmations no longer count.</p>}
      {open && isOwner && <button className="btn" type="button" onClick={() => act('Withdrawing…', call('withdraw'), 'Withdrawn')} disabled={!!tx.busy}>{tx.busy || 'Withdraw savings and yield'}</button>}
      {open && !acct.authenticated && <button className="btn ghost" type="button" onClick={acct.login} disabled={!acct.ready}>Sign in</button>}
      {open && isOwner && !plain && (
        <div className="card">
          <h3>Ask friends to confirm</h3>
          <Share url={link} text={`Please confirm my goal when I reach it: ${data.goal}.`} toast={toast} />
        </div>
      )}
      <Err>{tx.err}</Err>
    </section>
  );
}
