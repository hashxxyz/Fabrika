# Deploy FabrikaPay on Monad testnet (Remix)

1. Open https://remix.ethereum.org (on a phone, turn on Desktop site).
2. Create a file `FabrikaPay.sol` and paste the contents of `contracts/FabrikaPay.sol`.
3. Open the Solidity compiler tab. Pick compiler 0.8.24 and press Compile.
   If deployment later fails with an invalid opcode error, set EVM Version to `paris` and compile again.
4. Make sure your wallet is on Monad Testnet (chain ID 10143) and has test MON from https://faucet.monad.xyz.
5. Open the Deploy tab. Environment: `Injected Provider`. Contract: `FabrikaPay`. Press Deploy and approve in your wallet.
6. Copy the deployed address.
7. Open `index.html` and set `var CONTRACT = '0x…';` near the top of the script. Commit.
8. Optional: verify the source on the explorer from Remix with the Contract Verification plugin, so the source shows on MonadVision.

The contract has no constructor arguments, no owner and no admin functions. It never holds funds.
