import { parseAbi } from 'viem';

const env = (k) => (import.meta.env[k] || '').trim();

// Each feature has its own contract. Leave an address empty and that feature shows "not switched on".
export const ADDR = {
  split: env('VITE_SPLIT_ADDRESS'),
  savings: env('VITE_SAVINGS_ADDRESS'),
};

export const splitAbi = parseAbi([
  'function createSplit(bytes32 id, uint256[] amounts, uint64 expiresAt, string note)',
  'function payShare(bytes32 id, uint256 slot) payable',
  'function cancel(bytes32 id)',
  'function getSplit(bytes32 id) view returns (address creator, uint64 expiresAt, uint32 count, uint32 paidCount, uint8 status, string note)',
  'function getSlot(bytes32 id, uint256 slot) view returns (uint256 amount, address payer)',
]);
export const SPLIT_STATUS = ['None', 'Open', 'Complete', 'Cancelled', 'Expired'];

export const savingsAbi = parseAbi([
  'function open(bytes32 id, address[] verifiers, uint8 threshold, uint64 goalBy, string goal) payable',
  'function attest(bytes32 id)',
  'function withdraw(bytes32 id)',
  'function fundRewards() payable',
  'function getAccount(bytes32 id) view returns (address owner, uint256 principal, uint64 since, uint64 goalBy)',
  'function progressOf(bytes32 id) view returns (uint64 metAt, uint8 threshold, uint8 attestations, bool closed)',
  'function goalOf(bytes32 id) view returns (string)',
  'function verifiersOf(bytes32 id) view returns (address[])',
  'function hasAttested(bytes32 id, address who) view returns (bool)',
  'function pendingYield(bytes32 id) view returns (uint256)',
  'function rewards() view returns (uint256)',
  'function baseBps() view returns (uint256)',
  'function boostBps() view returns (uint256)',
]);
