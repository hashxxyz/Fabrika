# Fabrika

Pay anyone on Monad testnet by Telegram username, X username or wallet address. For usernames the sender locks MON in `FabrikaVault`; the recipient signs in with Privy, proves the username (Telegram through the bot, X through a linked X account), and claims. Unclaimed money returns to the sender. Wallet addresses are paid directly, with no vault.


## For judges (Monad Metropolis, Consumer Products & Payments)

Live product: **[PASTE YOUR LIVE LINK HERE]** (Monad Testnet, chain ID 10143)

**Who it is for.** People who are new to crypto and already get paid or pay others online: creators paid by their audience, freelancers and small businesses paid by clients, and students splitting costs. They all have an X or Telegram username and an email, and none of them want to learn about wallets. Fabrika lets them send and receive money with just that.

**Try it in 3 minutes. No wallet, no crypto knowledge, no faucet.**
1. Open the live link and tap Get started. Sign in with any email (a code is sent) or Google. A starter balance arrives by itself within seconds.
2. Send: choose X or Telegram, type a username and an amount, confirm. You get a claim link. Nothing leaves the vault until the right person claims.
3. Claim: open the link in another browser or private window, sign in as the recipient (X login for X names, the Telegram bot for Telegram names) and tap Claim. The recipient pays no fee.
4. Invoice: create an invoice, open the pay link or scan its QR code with a phone, and pay it. The invoice flips to Paid.
5. Split: split a bill between friends. Each friend pays their share from a link.
6. Save: lock MON toward a goal with an end date. Yield builds every second and you can withdraw any time.

No test login is needed. Judges can sign in with their own email. If the starter balance is slow, the Add funds link opens the Monad faucet.

**What actually runs onchain (nothing is simulated).**
- `FabrikaVault`: locks money for a username. Release needs a backend signature that binds the username, the destination wallet and a deadline (EIP-712). Unclaimed money can be cancelled or refunded after the expiry the sender chose.
- `FabrikaPay`: invoices with an amount, a deadline and a settled status.
- `FabrikaSplit`: one request, many payers, each share tracked onchain, with expiry.
- `FabrikaSavings`: lock until a date. Yield is paid from a rewards pool and accrues per second.
- Claims are gasless for the recipient. A relayer sends the transaction.

**Where the blockchain is hidden.** Sign in with email or Google creates the account. People pay a name, not an address. The words "gas", "vault" and "private key" are not in the main flows. Balances can be hidden with the eye icon.

**User testing.** [FILL IN with real results: how many people tried it, what confused them, what you changed. Even five people is enough. Do not invent numbers.]

**Distribution plan.** [FILL IN. Suggested: every payment creates a claim link that a new person must open, so each send is an invite. Start in X and Telegram communities of the target group, then one campus or one creator community at a time.]

**Team.** [FILL IN]

## Monad Metropolis: Consumer Products & Payments
Fabrika is a social payments app for people who do not know crypto. How it fits the track:
- **Pay a name, not an address.** Telegram or X username, or a wallet. The recipient does not need to have an account yet.
- **No blockchain in the first five minutes.** Sign in with email, Google or X. The wallet is created for them. The UI says "send" and "claim", not "vault" or "gas".
- **No fees for the person claiming.** A relayer pays gas for claims.
- **Fast on Monad.** The send screens show how long the confirmation took.
- **Safe by default.** Unclaimed money returns to the sender after the time they chose, and can be cancelled before that.

## Stack
- Vite + React
- Privy for sign in (email, Google, external wallet) and the embedded wallet
- viem for chain calls
- Monad Testnet, chain ID 10143, currency MON

## Setup
1. Create an app at https://dashboard.privy.io. Turn on Email, Google, X (Twitter) and Wallet login. Add your site domain to Allowed origins.
2. Copy `.env.example` to `.env` and fill in:
   - `VITE_PRIVY_APP_ID`
   - `VITE_VAULT_ADDRESS` (after you deploy the vault)
   - `VITE_PAY_ADDRESS` (after you deploy FabrikaPay, see `contracts/DEPLOY.md`)
   - `VITE_BOT_USERNAME` (stage 3)
3. `npm install`, then `npm run dev`. Deploy on Vercel with the same variables.

Without `VITE_PRIVY_APP_ID` the site shows a setup screen instead of the sign in modal.

## Contract
```
forge install foundry-rs/forge-std
forge test -vv
```
Source: `contracts/FabrikaVault.sol`. Tests: `test/FabrikaVault.t.sol`. Deploy with the authorizer address (the backend signer) as the one constructor argument.

## Recipient tag rule
Trim, drop leading `@`, lowercase. Telegram: keccak256 of the UTF-8 bytes. X: keccak256 of `x:` + the name, so the same name on both platforms never collides. The frontend (`src/lib.js`) and the backend (`api/_shared.js`) must use this same rule. The vault contract is unchanged: tags are opaque to it.

## Pages
Each page has its own URL and works on its own (top nav on desktop, bottom bar on phones).
- `/` Home: landing when signed out. Signed in: balance, send button and recent activity.
- `/transfer`: pick Telegram, X or Wallet.
  - Telegram / X: one `@username amount` per line, lock the total, get a claim link per person.
  - Wallet: one `0x…` address and an amount, sent straight from your wallet.
- `/invoice`: create an invoice (amount, what it is for, deadline). You get a link to share by WhatsApp, Telegram or copy.
- `/pay?i=<id>`: the payer opens the link, signs in, and pays the exact amount. Uses `contracts/FabrikaPay.sol`.
- `/account`: wallet address, balance, payouts with live vault status (cancel, take back), direct transfers.
- `/settings`: theme (system, light, dark), network info, clear saved data, sign out.
- `/claim?a=<allocationId>` (X payouts add `&k=x`): recipient signs in, proves the username, claims.

## Stage 3: claim backend and Telegram bot
Vercel serverless functions in `api/`:
- `POST /api/start-link`: claim page asks for a one-time code, bound to the Privy user and the wallet. Used in the bot deep link `https://t.me/<bot>?start=<code>`.
- `POST /api/telegram`: bot webhook. Checks the sender's @username against the on-chain recipient tag, shows the destination wallet, and asks for a tap to confirm.
- `GET /api/status`: tells the claim page if the identity is confirmed (`k=x` for X).
- `POST /api/claim`: verifies the Privy token and the confirmation (Telegram) or the verified X account (X), signs the EIP-712 claim, simulates it, and relays it from the relayer wallet (which pays gas). Returns `{ txHash }` or `{ message }`.

Why the confirm tap shows the wallet: it stops someone sending a victim their own bot link so the victim confirms the attacker's wallet. The claim only goes through if the Privy user and wallet match the ones that started the flow.

### Setup
1. Make the authorizer key: `node scripts/gen-key.mjs`. Deploy the vault with that address as the constructor argument. Optionally make a second key for the relayer.
2. Fund the relayer address (or the authorizer if you use one key) with MON from the faucet. Claims are refused below 0.01 MON.
3. Create a bot with @BotFather. Put the token and username in env.
4. Create a free Upstash Redis database and copy its REST URL and token.
5. Set all variables from `.env.example` in Vercel, then deploy. Also set `VITE_BOT_USERNAME`.
6. Point the bot at your site (once, after deploy):
```
TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... WEBHOOK_URL=https://YOUR-SITE/api/telegram node scripts/set-webhook.mjs
```
Run the frontend with `vercel dev` locally so `/api` works (plain `npm run dev` has no backend).

### X (Twitter) payouts
No bot needed. The recipient links X through Privy (OAuth), and the server reads the verified username from Privy's API using `PRIVY_APP_SECRET`. The claim only goes through if that username hashes to the payout's tag and the destination wallet belongs to the same Privy user. Turn on X login in the Privy dashboard and set `PRIVY_APP_SECRET`.

### History across devices
Payments, invoices and wallet transfers are saved on the device and also on the server, so the Account page looks the same on every phone you sign in on. `POST/GET /api/history` needs the Privy token, and only returns items for wallets on your own account. Every item is checked against the chain before it is stored (the sender, the recipient tag, the invoice owner). Invoices are stored as ids only: the amount and note are always read from the chain. Telegram and X usernames you paid are stored on the server so the list can show names; the chain only holds hashes. Without Redis the app falls back to this device's copy.

### Who is asking (invoices)
When someone creates an invoice, the server saves the verified identity Privy has for them: an X username (verified through OAuth) or a masked email. `GET /api/who?a=<wallet>` is public and returns only that label. The pay page shows it as "Requested by @name (verified on X)". If there is none, it says "Not verified" and shows the address. The pay page also tells the payer to only pay people they know.

### Starter balance
`POST /api/welcome`: a new, empty account gets a small one-time amount of test MON from the relayer wallet, so people do not need the faucet. The address must belong to the signed-in Privy user, each user and address gets one grant, and a daily cap applies (`WELCOME_AMOUNT`, `WELCOME_DAILY_CAP`). Fund the relayer with enough test MON for amount x daily cap.

### Known limits
- X usernames can be changed. Someone who takes over a name after its owner renames could claim an open payout for it. Keep expiry short for large amounts.
- Telegram usernames have the same weakness: they can be renamed or released and then taken by someone else, who could pass the bot check for an open payout. The sender only knows the username, not the numeric Telegram ID, so the vault cannot bind to the ID. Keep expiry short for large amounts.
- Wallet transfers are final: no claim step, no refund.
- No rate limiting yet. Add it before mainnet.
- If the authorizer key leaks, someone could redirect open payouts. Rotate by redeploying the vault.
- Telegram confirmation lasts 1 hour. After that, tap Confirm again.

### Descriptions
Every payment to a username has an optional description per person, and wallet transfers have one too. It is not written on chain (the vault has no note field). It is kept on the device and the server history, shown on the sender's Account page, added to the share message, and put in the claim link as `&n=...`, where the recipient sees it as "Note from the sender". Because it comes from the link it is not verified. It also names that transaction in Wallet activity.

### Wallet activity and names
`GET /api/activity?address=0x...` lists every MON movement in or out of the signed-in user's wallet, including ones made in other apps (Trust Wallet, MetaMask...). It reads Etherscan's V2 API for Monad Testnet (`txlist` for normal transfers, `txlistinternal` for contract payouts such as a vault claim or refund), so it needs a free `ETHERSCAN_API_KEY` and Redis (results are cached for 20 seconds). Only MON is listed, not other tokens, and zero-value contract calls are skipped. Only the wallet currently shown on the Account page is listed.

`GET/POST /api/labels` stores the names people give to an address ("Mum") or a single transaction ("Rent, May"), per wallet, in Redis (max 500, 80 characters each) with a copy on the device. A transaction name wins over an address name. Both endpoints need the Privy token and the wallet must belong to the signed-in user.

## More ways to move money (Explore)
Seven extra contracts, each switched on by its own address (see `contracts/DEPLOY.md`). All use plain MON and have no owner.

| Page | Contract | What it does |
| --- | --- | --- |
| `/split` | `FabrikaSplit` | Split a bill. One link, each person pays their own share to the creator. |
| `/save` | `FabrikaSavings` | Savings where friends confirm your goal and your rate goes up. |

### What is real and what is a trust assumption
- Income share: only income paid through the deal is shared. Nothing can force a person to route income there.
- Savings: yield comes from a rewards pool that people fund. It is not earned from outside lending. If the pool runs low, yield is paid up to what is left.
- Testnet only. Nothing here has been audited.

## Network
- RPC: https://testnet-rpc.monad.xyz
- Explorer: https://testnet.monadvision.com
- Faucet: https://faucet.monad.xyz

`legacy/` holds the old single-file app (Web3Auth and WalletConnect) for reference. `contracts/FabrikaPay.sol` powers invoices.

## Pending to claim (X)

When someone sends money to an X handle, the server also saves the payout id under that handle's tag (`pend:<tag>`). When the person signs in and has linked that X account, `/api/pending` lists every open payout for it, with the amount, status and expiry read from the chain. The Home and Account pages show them as "Pending to claim" with a Claim button, no link needed. Payments sent before this feature existed are not listed, but their links still work. Telegram is not covered yet.
