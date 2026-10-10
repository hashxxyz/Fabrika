import { parseAbi } from 'viem';

const env = (k) => (import.meta.env[k] || '').trim();

// Each feature has its own contract. Leave an address empty and that feature shows "not switched on".
export const ADDR = {
  split: env('VITE_SPLIT_ADDRESS'),
  pledge: env('VITE_PLEDGE_ADDRESS'),
  gift: env('VITE_GIFT_ADDRESS'),
  isa: env('VITE_ISA_ADDRESS'),
  stream: env('VITE_STREAM_ADDRESS'),
  cover: env('VITE_COVER_ADDRESS'),
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

export const pledgeAbi = parseAbi([
  'function createPool(bytes32 id, address judge, address beneficiary, uint64 joinBy, uint64 endsAt, string title) payable',
  'function join(bytes32 id) payable',
  'function resolve(bytes32 id, address[] winners)',
  'function withdraw(bytes32 id)',
  'function sweep(bytes32 id)',
  'function getPool(bytes32 id) view returns (address creator, address judge, address beneficiary, uint256 stake, uint8 phase)',
  'function timesOf(bytes32 id) view returns (uint64 joinBy, uint64 endsAt, uint32 count, uint32 winners)',
  'function titleOf(bytes32 id) view returns (string)',
  'function membersOf(bytes32 id) view returns (address[])',
  'function stateOf(bytes32 id, address who) view returns (uint8)',
]);
export const PLEDGE_PHASE = ['None', 'Joining', 'Running', 'Waiting for the judge', 'Settled', 'Void'];

export const giftAbi = parseAbi([
  'function createGift(bytes32 id, address recipient, address claimKey, address approver, uint64 unlockAt, uint64 expiresAt, bool revocable, string note) payable',
  'function approve(bytes32 id)',
  'function release(bytes32 id)',
  'function claim(bytes32 id, bytes signature)',
  'function cancel(bytes32 id)',
  'function refund(bytes32 id)',
  'function getGift(bytes32 id) view returns (address sender, address recipient, uint256 amount, uint64 unlockAt, uint64 expiresAt, uint8 status)',
  'function conditionsOf(bytes32 id) view returns (address approver, bool approved, bool revocable, bool bearer, bool ready, string note)',
]);
export const GIFT_STATUS = ['None', 'Open', 'Released', 'Cancelled', 'Returned'];

export const isaAbi = parseAbi([
  'function createDeal(bytes32 id, uint256 target, uint16 shareBps, uint16 capBps, uint64 fundBy, uint64 termSecs, string note)',
  'function fund(bytes32 id) payable',
  'function payIncome(bytes32 id) payable',
  'function claimReturns(bytes32 id)',
  'function cancel(bytes32 id)',
  'function refundFunding(bytes32 id)',
  'function getDeal(bytes32 id) view returns (address beneficiary, uint256 target, uint256 raised, uint256 repaid, uint8 status)',
  'function termsOf(bytes32 id) view returns (uint16 shareBps, uint16 capBps, uint64 fundBy, uint64 termEndsAt)',
  'function noteOf(bytes32 id) view returns (string)',
  'function backerInfo(bytes32 id, address who) view returns (uint256 funded, uint256 claimable, uint256 claimed)',
]);
export const ISA_STATUS = ['None', 'Funding', 'Active', 'Cancelled', 'Not filled'];

export const streamAbi = parseAbi([
  'function createStream(bytes32 id, address recipient, uint256 rate, uint64 start, uint64 stop, string note) payable',
  'function withdraw(bytes32 id)',
  'function cancel(bytes32 id)',
  'function getStream(bytes32 id) view returns (address payer, address recipient, uint256 rate, uint64 start, uint64 stop)',
  'function progressOf(bytes32 id) view returns (bool cancelled, uint256 streamed, uint256 withdrawn)',
  'function noteOf(bytes32 id) view returns (string)',
]);

export const coverAbi = parseAbi([
  'function buy(bytes32 id, uint256 cover, uint256 minutes_) payable',
  'function claim(bytes32 id, uint256 payout, uint256 deadline, bytes signature)',
  'function release(bytes32 id)',
  'function deposit() payable',
  'function withdraw(uint256 shares)',
  'function quote(uint256 cover, uint256 minutes_) view returns (uint256)',
  'function getPolicy(bytes32 id) view returns (address insured, uint256 cover, uint64 start, uint64 end, bool settled, uint8 phase)',
  'function positionOf(address who) view returns (uint256 value, uint256 withdrawable)',
  'function sharesOf(address who) view returns (uint256)',
  'function capacity() view returns (uint256)',
  'function assets() view returns (uint256)',
  'function ratePpm() view returns (uint256)',
  'function adjudicator() view returns (address)',
]);
export const COVER_PHASE = ['None', 'Covered now', 'Ended, claim window open', 'Ended', 'Closed'];

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
