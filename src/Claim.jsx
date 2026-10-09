import { useCallback, useEffect, useState } from 'react';
import { formatEther } from 'viem';
import { VAULT, BOT, vaultAbi, publicClient, explorer, STATUS } from './chain.js';
import { fmtMon, fmtDate, cleanError } from './lib.js';
import { Stitch, Badge } from './ui.jsx';

const ID_RE = /^0x[0-9a-fA-F]{64}$/;

export default function Claim({ acct }) {
  const a = new URLSearchParams(location.search).get('a') || '';
  const [info, setInfo] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [tx, setTx] = useState('');
  const [tgLink, setTgLink] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!ID_RE.test(a)) { setLoadErr('This claim link is not valid.'); return; }
    if (!VAULT) { setLoadErr('The vault is not configured yet.'); return; }
    publicClient.readContract({ address: VAULT, abi: vaultAbi, functionName: 'getAllocation', args: [a] })
      .then((r) => {
        if (Number(r[5]) === 0) setLoadErr('No payout found for this link.');
        else setInfo({ amount: r[3], expiresAt: r[4], status: Number(r[5]) });
      })
      .catch(() => setLoadErr('Could not reach Monad. Try again.'));
  }, [a]);

  async function call(path, init = {}) {
    const token = await acct.getAccessToken();
    const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` } });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.message || (res.status === 404 ? 'The claim service is not live yet.' : 'Request failed. Try again.'));
    return j;
  }

  const checkConfirmed = useCallback(async () => {
    if (!acct.authenticated || !acct.address || !ID_RE.test(a)) return false;
    try {
      const j = await call(`/api/status?a=${a}&d=${acct.address}`);
      if (j.confirmed) setConfirmed(true);
      return !!j.confirmed;
    } catch { return false; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acct.authenticated, acct.address, a]);

  // Check once on load (the person may already have confirmed), then poll while they are in Telegram.
  useEffect(() => { checkConfirmed(); }, [checkConfirmed]);
  useEffect(() => {
    if (!tgLink || confirmed) return;
    const t = setInterval(checkConfirmed, 3000);
    return () => clearInterval(t);
  }, [tgLink, confirmed, checkConfirmed]);

  async function startTelegram() {
    setErr(''); setBusy(true);
    try {
      const j = await call('/api/start-link', { method: 'POST', body: JSON.stringify({ allocationId: a, destination: acct.address }) });
      setTgLink(`https://t.me/${BOT}?start=${j.code}`);
    } catch (e) { setErr(cleanError(e)); } finally { setBusy(false); }
  }

  async function claim() {
    setErr(''); setBusy(true);
    try {
      const j = await call('/api/claim', { method: 'POST', body: JSON.stringify({ allocationId: a, destination: acct.address }) });
      setTx(j.txHash || 'done');
    } catch (e) {
      setErr(cleanError(e));
    } finally {
      setBusy(false);
    }
  }

  const open = info?.status === 1;
  const paid = tx || info?.status === 2;

  return (
    <div className="hero-grid">
      <div>
        <h1>{paid ? 'It is yours.' : 'Someone paid you.'}</h1>
        <p className="lede">Sign in, confirm your Telegram username, and the vault sends the MON to your wallet.</p>
      </div>
      <div className="slip" data-paid={paid ? '1' : '0'}>
        {loadErr ? <p className="err">{loadErr}</p> : !info ? <p className="note">Checking the vault…</p> : (
          <>
            <div className="slip-top"><span>Payout waiting</span><Badge>{paid ? 'Claimed' : STATUS[info.status]}</Badge></div>
            <div className="slip-amt">{fmtMon(info.amount)}<small>MON</small></div>
            <div className="slip-note">{formatEther(info.amount)} MON, expires {fmtDate(info.expiresAt)}</div>
            <Stitch />
            {open && !tx && (
              <ol className="mini steps2">
                <li data-done={acct.authenticated ? '1' : '0'}>1. Sign in</li>
                <li data-done={confirmed ? '1' : '0'}>2. Confirm your Telegram username</li>
                <li>3. Claim</li>
              </ol>
            )}
            {open && !acct.authenticated && <button className="btn" type="button" onClick={acct.login} disabled={!acct.ready}>Sign in</button>}
            {open && acct.authenticated && !tx && (
              <>
                {!confirmed && !BOT && <p className="msg bad">The Telegram bot is not set up yet.</p>}
                {!confirmed && BOT && !tgLink && (
                  <button className="btn ghost" type="button" onClick={startTelegram} disabled={busy || !acct.address}>{busy ? 'One moment…' : 'Confirm on Telegram'}</button>
                )}
                {!confirmed && tgLink && (
                  <>
                    <a className="btn ghost linkbtn2" href={tgLink} target="_blank" rel="noopener">Open Telegram</a>
                    <p className="note">In Telegram, tap Start, then confirm your wallet. This page updates by itself.</p>
                  </>
                )}
                {confirmed && <p className="note">Telegram confirmed.</p>}
                <button className="btn" type="button" onClick={claim} disabled={busy || !confirmed} style={{ marginTop: 10 }}>{busy && confirmed ? 'Claiming…' : 'Claim to my wallet'}</button>
              </>
            )}
            {tx && tx !== 'done' && <p className="msg"><a href={explorer.tx(tx)} target="_blank" rel="noopener">View transaction</a></p>}
            {!open && !paid && <p className="msg">This payout is {STATUS[info.status].toLowerCase()} and can no longer be claimed.</p>}
            <p className="msg bad" role="alert">{err}</p>
          </>
        )}
      </div>
    </div>
  );
}
