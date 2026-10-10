import { useEffect } from 'react';
import { Link } from './router.jsx';

const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

const TERMS = [
  ['Wallet', 'Like a bank account for crypto. Its address is like an account number.'],
  ['MON', 'The coin of the Monad network. On the testnet it is free practice money.'],
  ['Smart contract', 'A small program on the blockchain that holds money and follows fixed rules. Nobody can bend them.'],
  ['Faucet', 'A website that hands out free test MON.'],
  ['Gas', 'The tiny fee for using the network. Fabrika shows it as the network fee.'],
  ['Privy', 'The service that handles sign-in and creates your wallet for you.'],
];

const FAQ = [
  ['Is this real money?', 'No. Fabrika runs on the Monad testnet and uses test MON, which has no real value.'],
  ['Do I need a wallet or MetaMask?', 'No. Sign in with email, Google or X and Fabrika creates a wallet for you.'],
  ['Why is my balance 0?', 'New accounts get 0.1 test MON automatically. If it has not arrived, wait a moment and refresh. You can also get free test MON at faucet.monad.xyz.'],
  ['What if the other person never claims the money?', 'After the return date shown on the payment, you can take the money back. You can also cancel it before it is claimed.'],
  ['Can a payment be claimed twice?', 'No. The smart contract allows only one claim.'],
  ['Can I send to someone who has no account?', 'Yes. They open your claim link, or sign in with the X account you paid, and a wallet is made for them.'],
  ['Where do I see money sent to my X handle?', 'Sign in and link your X account. Payments sent to your handle show as "Pending to claim" on Home and Account.'],
  ['How do I know an invoice is real?', 'Check the "Requested by" line. A verified X account or masked email is a good sign. "Not verified" means be careful. Only pay people you know.'],
  ['Where are my receipts?', 'In Account. Tap Receipt on any item. You can download it as an image or copy it.'],
  ['Will my history show on another phone?', 'Yes. Sign in with the same account and it appears there.'],
  ['Can I use my wallet outside Fabrika?', 'Yes. In Settings, use Back up your wallet to export the private key and import it into MetaMask.'],
  ['Is my private key safe?', 'The key shows in a secure Privy window, so Fabrika never sees it. Never share it with anyone.'],
  ['Which network does it use?', 'Monad Testnet, chain ID 10143.'],
];

const TOC = [['what', 'What is Fabrika'], ['words', 'Words you will meet'], ['start', 'Getting started'], ['send', 'Send money'], ['claim', 'Claim money'], ['invoices', 'Invoices'], ['receipts', 'Receipts and history'], ['safety', 'Safety and limits'], ['faq', 'FAQ'], ['built', 'How it is built']];

export default function Docs() {
  // /docs#faq opens straight at the FAQ
  useEffect(() => { if (location.hash) setTimeout(() => go(location.hash.slice(1)), 50); }, []);
  return (
    <section className="col docs">
      <h1 className="title">Docs</h1>
      <p className="lede">Everything about Fabrika in plain words.</p>
      <div className="toc" role="navigation" aria-label="On this page">
        {TOC.map(([id, l]) => <button key={id} className="pill" type="button" onClick={() => go(id)}>{l}</button>)}
      </div>

      <h2 id="what">What is Fabrika?</h2>
      <p>Fabrika lets you send money on the Monad blockchain to a Telegram username, an X handle or a link, so you never need the other person's wallet address.</p>
      <p>Sending crypto is usually hard. You need a long wallet address, one wrong letter sends the money to the wrong place forever, and the person receiving it must already have a wallet. With Fabrika you say who to pay and how much. They sign in with email, Google or X, and the money arrives. If they never claim it, the money returns to you.</p>
      <p>Fabrika runs on the Monad <b>testnet</b>, a practice network. The money is test MON and has no real value, so it is safe to try.</p>

      <h2 id="words">Words you will meet</h2>
      <div className="card">{TERMS.map(([k, v]) => <div className="set-row" key={k}><span><b>{k}</b></span><span>{v}</span></div>)}</div>

      <h2 id="start">Getting started</h2>
      <ol>
        <li>Open Fabrika and tap <b>Sign in</b>.</li>
        <li>Choose email, Google, X or an existing wallet.</li>
        <li>Fabrika creates your wallet in the background. You install nothing.</li>
        <li>A new account with an empty balance gets a one-time starter amount of 0.1 test MON, so you do not need a faucet.</li>
      </ol>
      <p>Your balance and address show on Home and in Account.</p>

      <h2 id="send">Send money</h2>
      <p>You send to a person, not an address. The money waits in a locked box until that person claims it.</p>
      <ol>
        <li>Go to <Link to="/transfer">Send</Link>.</li>
        <li>Enter who to pay, a Telegram username or an X handle, and the amount. You can add several people at once.</li>
        <li>Confirm. Fabrika locks the money in a smart contract on Monad.</li>
        <li>For Telegram, send the claim link to the person yourself. For X, the person can also just sign in and find it.</li>
        <li>A receipt appears right away and the payment shows in your history.</li>
      </ol>
      <p>Every payment has a return date, shown as "Returns to you after". If nobody claims it by then, you can take the money back. You can also cancel a payment that has not been claimed. Only the sender can cancel or take money back.</p>

      <h2 id="claim">Claim money</h2>
      <p>There are two ways to get money sent to your X account.</p>
      <ol>
        <li><b>Sign in and look.</b> Sign in to Fabrika and link your X account. Payments sent to your handle show as <b>Pending to claim</b> on Home and Account. Tap <b>Claim</b>.</li>
        <li><b>Use the claim link.</b> Open the link you were sent, sign in, prove the account is yours, and tap Claim.</li>
      </ol>
      <p>For Telegram, open the claim link and confirm your username in the Fabrika bot. In every case our server checks the proof and signs an approval, and only that approval opens the locked box. The money goes to your wallet, Fabrika pays the network fee, and a payment can be claimed only once.</p>

      <h2 id="invoices">Invoices</h2>
      <p>An invoice is a payment request with an exact amount and a deadline. You share one link and the other person pays from that page.</p>
      <p><b>To ask for money:</b> go to <Link to="/invoice">Invoice</Link>, enter the amount, a short note and the deadline, then share the link. When they pay, the invoice is marked paid.</p>
      <p><b>To pay one:</b> open the link, sign in, read who is asking and what it is for, then pay the exact amount before the deadline. An invoice can be paid only once.</p>
      <p>The pay page shows who is asking, such as "Requested by @ada (verified on X)" or a masked email. If Fabrika cannot verify the person, it says "Not verified". Only pay people you know.</p>

      <h2 id="receipts">Receipts, history and wallet export</h2>
      <p>Every payment gives you a Fabrika receipt inside the app, so you never need to open a blockchain explorer.</p>
      <ul>
        <li>A receipt card shows after you send money or pay an invoice. Tap <b>Receipt</b> on any item in Account to open the full page. Anyone with its link can open it.</li>
        <li>Use <b>Download image</b> to save the receipt as a picture, or <b>Copy image</b> to paste it into a chat.</li>
        <li>Your payments, invoices and transfers are saved on our server as well as your device, so they appear on any phone you sign in on.</li>
        <li>In <Link to="/settings">Settings</Link>, <b>Back up your wallet</b> exports your private key so you can open the same wallet in MetaMask. The key shows in a secure Privy window and Fabrika never sees it. Never share it.</li>
      </ul>

      <h2 id="safety">Safety and known limits</h2>
      <p>Money in the locked box can leave in only two ways: a claim approved by our server, or a return to the sender. The rules live in smart contracts, so they cannot be skipped.</p>
      <ul>
        <li>A payment cannot be claimed twice.</li>
        <li>Only the sender can cancel or take money back.</li>
        <li>An invoice needs the exact amount, must be paid before its deadline and can be paid only once.</li>
        <li>Fabrika is a testnet demo, so the money has no real value.</li>
        <li>Invoice notes are written by whoever makes the invoice. The verified label helps you spot fakes but cannot stop a determined scammer.</li>
        <li>Names of people you paid are stored on our server, because the blockchain only holds scrambled versions of them.</li>
        <li>People who arrive only to claim money also get the 0.1 MON starter balance, within a daily cap.</li>
      </ul>

      <h2 id="faq">FAQ</h2>
      <div className="faq">
        {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
      </div>

      <h2 id="built">How it is built</h2>
      <p>Fabrika is a React app on Vercel, two smart contracts on Monad testnet, and a small server that checks identity before money moves.</p>
      <div className="card">
        {[
          ['Vault contract', 'Holds payments in a locked box. Releases money only on a claim signed by the authorizer, or back to the sender.'],
          ['Pay contract', 'Handles invoices. Enforces the exact amount and the deadline, and allows one payment.'],
          ['Privy', 'Sign-in with email, Google and X, plus the embedded wallet.'],
          ['Telegram bot', 'Confirms that a claimer owns the Telegram username.'],
          ['Server functions', 'Check sign-in, sign claim approvals, pay claim fees, find pending payments and store history.'],
        ].map(([k, v]) => <div className="set-row" key={k}><span><b>{k}</b></span><span>{v}</span></div>)}
      </div>
      <p className="note">Amounts, status and deadlines are always read from the chain, never trusted from the app.</p>
    </section>
  );
}
