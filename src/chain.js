import { defineChain, createPublicClient, http, parseAbi } from 'viem';

export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
  blockExplorers: { default: { name: 'MonadVision', url: 'https://testnet.monadvision.com' } },
});

export const PRIVY_APP_ID = (import.meta.env.VITE_PRIVY_APP_ID || '').trim();
export const VAULT = (import.meta.env.VITE_VAULT_ADDRESS || '').trim();
export const PAY = (import.meta.env.VITE_PAY_ADDRESS || '').trim();
export const BOT = (import.meta.env.VITE_BOT_USERNAME || '').trim().replace(/^@/, '');

export const publicClient = createPublicClient({ chain: monadTestnet, transport: http() });

export const explorer = {
  tx: (h) => `https://testnet.monadvision.com/tx/${h}`,
  address: (a) => `https://testnet.monadvision.com/address/${a}`,
};
export const FAUCET = 'https://faucet.monad.xyz';

export const vaultAbi = parseAbi([
  'function createBatch(bytes32 batchId, bytes32[] allocationIds, bytes32[] recipientTags, uint256[] amounts, uint64 expiresAt) payable',
  'function cancel(bytes32 allocationId)',
  'function refund(bytes32 allocationId)',
  'function claim(bytes32 allocationId, address destination, uint256 deadline, bytes signature)',
  'function getAllocation(bytes32 allocationId) view returns (address sender, bytes32 batchId, bytes32 recipientTag, uint256 amount, uint64 expiresAt, uint8 status)',
]);

// Matches the Status enum in FabrikaVault.sol
export const STATUS = ['None', 'Open', 'Claimed', 'Cancelled', 'Refunded', 'Expired'];

// FabrikaPay: invoices (payment requests). Matches the Status enum in FabrikaPay.sol
export const payAbi = parseAbi([
  'function createRequest(bytes32 id, uint256 amount, uint64 expiresAt, string note)',
  'function pay(bytes32 id) payable',
  'function cancel(bytes32 id)',
  'function getRequest(bytes32 id) view returns (address recipient, uint256 amount, uint64 expiresAt, uint8 status, address payer, uint64 paidAt, uint64 paidBlock)',
  'function noteOf(bytes32 id) view returns (string)',
]);
export const PAY_STATUS = ['None', 'Open', 'Paid', 'Cancelled', 'Expired'];

// Current chain time in seconds. Falls back to the device clock if the RPC is unreachable.
export async function chainNow() {
  try { return Number((await publicClient.getBlock()).timestamp); } catch { return Math.floor(Date.now() / 1000); }
}
