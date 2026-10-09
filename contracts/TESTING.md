# FabrikaPay manual test checklist

These tests are run by hand against the deployed contract on Monad testnet, using the Fabrika app and two wallets (A creates, B pays). No automated test suite is included yet.

## Contract
- [ ] A creates a request for 0.5 MON. The slip loads for B and shows amount, note and A's address.
- [ ] B pays exactly 0.5 MON. A's balance rises by 0.5 MON. The slip shows Paid with the transaction hash.
- [ ] Underpayment: in Remix call `pay(id)` with 0.4 MON value. It reverts with "Wrong amount".
- [ ] Overpayment: call `pay(id)` with 0.6 MON value. It reverts with "Wrong amount".
- [ ] Second payment: B tries to pay the same request again. It reverts with "Not open".
- [ ] Expiry: create a request that expires in 1 hour, wait for it to pass (or use a short custom expiry in Remix). `pay` reverts with "Expired" and the slip shows Expired.
- [ ] Cancel: A cancels an open request. Paying it then reverts with "Not open". The slip shows Cancelled.
- [ ] Unauthorized cancel: B calls `cancel(id)` on A's open request. It reverts with "Not creator".
- [ ] Duplicate id: calling `createRequest` twice with the same id reverts with "Request exists".

## Frontend
- [ ] Connect wallet and switch to Monad testnet.
- [ ] Open the payment link in another browser or a private window.
- [ ] Paid status on the requester's open slip changes by itself within about 5 seconds.
- [ ] Receipt shows the right transaction hash and the explorer link opens it.
- [ ] History shows the requests created and payments made on this device.
- [ ] Rejecting in the wallet shows a clear message. Pending and error states are readable.
