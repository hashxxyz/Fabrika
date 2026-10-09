# Fabrika

Pay anyone on Telegram, on Monad testnet. The sender locks MON in `FabrikaVault` for a Telegram username. The recipient signs in with Privy, proves the username through the bot, and claims. Unclaimed money returns to the sender.

## Stack
- Vite + React
- Privy for sign in (email, Google, external wallet) and the embedded wallet
- viem for chain calls
- Monad Testnet, chain ID 10143, currency MON

## Setup
1. Create an app at https://dashboard.privy.io. Turn on Email, Google and Wallet login. Add your site domain to Allowed origins.
2. Copy `.env.example` to `.env` and fill in:
   - `VITE_PRIVY_APP_ID`
   - `VITE_VAULT_ADDRESS` (after you deploy the vault)
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
Trim, drop leading `@`, lowercase, then keccak256 of the UTF-8 bytes. The frontend (`src/lib.js`) and the stage 3 backend must use this same rule.

## Screens
- Home: sign in with the Privy modal.
- New payout: one `@username amount` per line, lock the total, get a claim link per person.
- Payouts: live status from the vault, cancel an open allocation, take back an expired one.
- `/claim?a=<allocationId>`: recipient signs in, confirms on Telegram, claims.

## Stage 3: claim backend and Telegram bot
Vercel serverless functions in `api/`:
- `POST /api/start-link`: claim page asks for a one-time code, bound to the Privy user and the wallet. Used in the bot deep link `https://t.me/<bot>?start=<code>`.
- `POST /api/telegram`: bot webhook. Checks the sender's @username against the on-chain recipient tag, shows the destination wallet, and asks for a tap to confirm.
- `GET /api/status`: tells the claim page if Telegram is confirmed.
- `POST /api/claim`: verifies the Privy token and the confirmation, signs the EIP-712 claim, simulates it, and relays it from the relayer wallet (which pays gas). Returns `{ txHash }` or `{ message }`.

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

### Known limits
- No rate limiting yet. Add it before mainnet.
- If the authorizer key leaks, someone could redirect open payouts. Rotate by redeploying the vault.
- Telegram confirmation lasts 1 hour. After that, tap Confirm again.

## Network
- RPC: https://testnet-rpc.monad.xyz
- Explorer: https://testnet.monadvision.com
- Faucet: https://faucet.monad.xyz

`legacy/` holds the old single-file app (Web3Auth and WalletConnect) for reference. `contracts/FabrikaPay.sol` is the old payment-link contract.
