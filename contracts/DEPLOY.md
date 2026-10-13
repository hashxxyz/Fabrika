# Deploy FabrikaPay on Monad testnet (Remix)

1. Open https://remix.ethereum.org (on a phone, turn on Desktop site).
2. Create a file `FabrikaPay.sol` and paste the contents of `contracts/FabrikaPay.sol`.
3. Open the Solidity compiler tab. Pick compiler 0.8.24 and press Compile.
   If deployment later fails with an invalid opcode error, set EVM Version to `paris` and compile again.
4. Make sure your wallet is on Monad Testnet (chain ID 10143) and has test MON from https://faucet.monad.xyz.
5. Open the Deploy tab. Environment: `Injected Provider`. Contract: `FabrikaPay`. Press Deploy and approve in your wallet.
6. Copy the deployed address.
7. Put the address in `VITE_PAY_ADDRESS` (locally in `.env`, and in Vercel > Settings > Environment Variables), then redeploy.
8. Optional: verify the source on the explorer from Remix with the Contract Verification plugin, so the source shows on MonadVision.

The contract has no constructor arguments, no owner and no admin functions. It never holds funds.

---

# Deploy the seven feature contracts

Same steps as FabrikaPay (Remix, compiler 0.8.24, EVM version `paris`, Injected Provider). Each contract is independent. Deploy only the ones you want. A feature with no address shows "not switched on".

| Contract | Constructor arguments | Env variable |
| --- | --- | --- |
| `FabrikaSplit` | none | `VITE_SPLIT_ADDRESS` |
| `FabrikaPledge` | none | `VITE_PLEDGE_ADDRESS` |
| `FabrikaGift` | none | `VITE_GIFT_ADDRESS` |
| `FabrikaIncomeShare` | none | `VITE_ISA_ADDRESS` |
| `FabrikaStream` | none | `VITE_STREAM_ADDRESS` |
| `FabrikaCover` | `adjudicator_` (wallet that approves claims), `ratePpm_` (try `500`, which is 0.05% of the cover per minute) | `VITE_COVER_ADDRESS` |
| `FabrikaSavings` | `baseBps_` (try `500`, 5% a year), `boostBps_` (try `2000`, 20% a year) | `VITE_SAVINGS_ADDRESS` |

None of them has an owner or admin. `FabrikaCover` fixes its adjudicator and rate at deploy. `FabrikaSavings` fixes its two rates.

Only `FabrikaSplit` and `FabrikaSavings` have screens in this app today. Pledge, Gift, IncomeShare, Stream and Cover are contracts only, and their env variables are not read yet.
After you deploy `FabrikaCover`, add liquidity by calling `deposit()`. Cover can only be sold up to what the pool holds.
After you deploy `FabrikaSavings`, fund its rewards pool from the app (Goal savings > Rewards pool). You can also point a `FabrikaPledge` beneficiary at the savings contract address, so forfeited stakes become savers' rewards.

## Tests
```
forge install foundry-rs/forge-std
forge test -vv
```
`test/FabrikaFeatures.t.sol` covers the seven contracts. It has not been run yet. Run it before you deploy anything.
