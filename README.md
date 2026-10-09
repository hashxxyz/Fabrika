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

## Smart contract (optional upgrade)
`contracts/FabrikaPay.sol` makes requests enforceable on-chain: exact amount, one payment per request, expiry, creator-only cancel. Paid status then comes from the contract and updates by itself. Deploy steps are in `contracts/DEPLOY.md`, tests in `contracts/TESTING.md`. Set `CONTRACT` in `index.html` to turn it on. Without it the app uses the transaction-reference mode.

## Network
- Monad Testnet, chain ID 10143, currency MON
- RPC: https://testnet-rpc.monad.xyz
- Explorer: https://testnet.monadvision.com
- Faucet: https://faucet.monad.xyz

## Run
No install needed. Open `index.html` in a browser with a wallet, or deploy the folder to Vercel or Netlify as a static site.
