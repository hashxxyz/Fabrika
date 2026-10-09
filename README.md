# Fabrika

Pay and get paid with a link on Monad testnet. Built for Monad Metropolis.

## Features
- Silk landing page, dark and light
- Wallet connect (MetaMask, Rabby, Phantom) and Monad testnet switch
- Send test MON with live confirmation
- Payment requests as shareable links (details travel inside the link, no server)
- Pay page: payer sends MON with a reference id in the transaction data
- On-chain verification: receipt link or pasted hash is checked against recipient, amount and reference
- History saved on the device

## Wallets
The Connect button opens a wallet picker: wallets detected in the browser (EIP-6963), links that open the page inside MetaMask, Trust Wallet, Coinbase Wallet or Phantom, and WalletConnect. To show WalletConnect, create a free project at https://dashboard.reown.com, add your site's domain to its allowlist, and set `WC_PROJECT_ID` near the top of the script in `index.html`.

## Smart contract (optional upgrade)
`contracts/FabrikaPay.sol` makes requests enforceable on-chain: exact amount, one payment per request, expiry, creator-only cancel. Paid status then comes from the contract and updates by itself. Deploy steps are in `contracts/DEPLOY.md`, tests in `contracts/TESTING.md`. Set `CONTRACT` in `index.html` to turn it on. Without it the app uses the transaction-reference mode.

## Network
- Monad Testnet, chain ID 10143, currency MON
- RPC: https://testnet-rpc.monad.xyz
- Explorer: https://testnet.monadvision.com
- Faucet: https://faucet.monad.xyz

## Run
WalletConnect is bundled with Vite, so the site works in any browser, with no wallet browser needed.

```
npm install
npm run dev      # local
npm run build    # outputs dist/
```

Deploy on Vercel from GitHub or with the Vercel CLI. Vercel detects Vite and runs the build. Dragging the raw folder into a static host skips the build and WalletConnect falls back to a CDN.
