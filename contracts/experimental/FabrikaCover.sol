// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title FabrikaCover
/// @notice Insurance by the minute. Pick an amount to cover and how many minutes. Pay a premium
///         that scales with both. Underwriters put MON into a shared pool and earn the premiums.
///         If something goes wrong during the cover, the adjudicator signs a claim and the pool pays.
/// @dev The adjudicator is a trust assumption. It decides whether a loss happened and how much to pay,
///      up to the covered amount. The pool never promises more cover than it holds: cover that is
///      sold is reserved until the policy and its claim window end. Underwriter shares are
///      priced by pool assets, so one underwriter can lose money if claims exceed premiums.
///      No owner, no admin. The adjudicator and the rate are fixed at deploy.
/// @dev WARNING: a loss only reduces pool assets when the claim is paid. Underwriters can withdraw free
///      (unreserved) assets before that. Treat the pool as trust based, like the adjudicator.
contract FabrikaCover {
    struct Policy {
        address insured;
        uint64 start;
        uint64 end;
        bool settled; // claimed or released
        uint256 cover;
    }

    bytes32 public constant CLAIM_TYPEHASH =
        keccak256("Claim(bytes32 policyId,address insured,uint256 payout,uint256 deadline)");
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    uint256 private constant HALF_N = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    uint256 public constant MIN_MINUTES = 15;
    uint256 public constant MAX_MINUTES = 10080; // 7 days
    uint256 public constant CLAIM_WINDOW = 3 days;
    uint256 public constant MIN_DEPOSIT = 1e15;

    address public immutable adjudicator;
    /// @notice Premium in parts per million of the covered amount, per minute. 500 = 0.05% per minute.
    uint256 public immutable ratePpm;

    uint256 public assets;      // MON owned by underwriters (deposits plus premiums minus payouts)
    uint256 public reserved;    // cover currently promised
    uint256 public totalShares;
    mapping(address => uint256) public sharesOf;
    mapping(bytes32 => Policy) private _policies;
    uint256 private _lock = 1;

    event PolicyBought(bytes32 indexed id, address indexed insured, uint256 cover, uint64 end);
    event ClaimPaid(bytes32 indexed id, address indexed insured, uint256 payout);
    event Released(bytes32 indexed id);
    event Deposited(address indexed underwriter, uint256 amount, uint256 shares);
    event WithdrawnShares(address indexed underwriter, uint256 amount, uint256 shares);

    modifier nonReentrant() {
        require(_lock == 1, "Reentrancy");
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address adjudicator_, uint256 ratePpm_) {
        require(adjudicator_ != address(0), "Bad adjudicator");
        require(ratePpm_ > 0 && ratePpm_ <= 10000, "Bad rate");
        adjudicator = adjudicator_;
        ratePpm = ratePpm_;
    }

    // ------------------------------------------------------------ insured side

    /// @notice Premium for a cover, rounded up.
    function quote(uint256 cover, uint256 minutes_) public view returns (uint256) {
        return (cover * minutes_ * ratePpm + 999_999) / 1_000_000;
    }

    function buy(bytes32 id, uint256 cover, uint256 minutes_) external payable nonReentrant {
        require(id != bytes32(0), "Bad id");
        require(_policies[id].insured == address(0), "Policy exists");
        require(cover > 0, "No cover");
        require(minutes_ >= MIN_MINUTES && minutes_ <= MAX_MINUTES, "Bad duration");
        require(msg.value == quote(cover, minutes_), "Wrong premium");
        require(reserved + cover <= assets, "Not enough capacity");

        Policy storage p = _policies[id];
        p.insured = msg.sender;
        p.start = uint64(block.timestamp);
        p.end = uint64(block.timestamp + minutes_ * 60);
        p.cover = cover;
        reserved += cover;
        assets += msg.value;
        emit PolicyBought(id, msg.sender, cover, p.end);
    }

    /// @notice Pay a claim. Needs the adjudicator's signature over this exact policy, payout and deadline.
    ///         Anyone can submit it. The money always goes to the insured.
    function claim(bytes32 id, uint256 payout, uint256 deadline, bytes calldata signature) external nonReentrant {
        Policy storage p = _policies[id];
        require(p.insured != address(0), "No policy");
        require(!p.settled, "Settled");
        require(block.timestamp <= uint256(p.end) + CLAIM_WINDOW, "Claim window closed");
        require(block.timestamp <= deadline, "Authorization expired");
        require(payout > 0 && payout <= p.cover, "Bad payout");
        require(_recover(claimDigest(id, p.insured, payout, deadline), signature) == adjudicator, "Bad authorization");

        p.settled = true;
        reserved -= p.cover;
        assets -= payout;
        (bool ok, ) = p.insured.call{value: payout}("");
        require(ok, "Transfer failed");
        emit ClaimPaid(id, p.insured, payout);
    }

    /// @notice After the claim window, free the reserved cover. Anyone can call this.
    function release(bytes32 id) external {
        Policy storage p = _policies[id];
        require(p.insured != address(0) && !p.settled, "Nothing to release");
        require(block.timestamp > uint256(p.end) + CLAIM_WINDOW, "Window open");
        p.settled = true;
        reserved -= p.cover;
        emit Released(id);
    }

    /// @notice Release many ended policies in one call. Skips any that are not ready.
    function releaseMany(bytes32[] calldata ids) external {
        for (uint256 i = 0; i < ids.length; ++i) {
            Policy storage p = _policies[ids[i]];
            if (p.insured == address(0) || p.settled || block.timestamp <= uint256(p.end) + CLAIM_WINDOW) continue;
            p.settled = true;
            reserved -= p.cover;
            emit Released(ids[i]);
        }
    }

    // ---------------------------------------------------------- underwriter side

    function deposit() external payable nonReentrant {
        require(msg.value >= MIN_DEPOSIT, "Too small");
        uint256 shares;
        if (totalShares == 0) {
            shares = msg.value;
        } else {
            require(assets > 0, "Pool empty");
            shares = (msg.value * totalShares) / assets;
            require(shares > 0, "Too small");
        }
        totalShares += shares;
        sharesOf[msg.sender] += shares;
        assets += msg.value;
        emit Deposited(msg.sender, msg.value, shares);
    }

    /// @notice Cash out shares. Only the part of the pool that is not reserved for cover can leave.
    function withdraw(uint256 shares) external nonReentrant {
        require(shares > 0 && shares <= sharesOf[msg.sender], "Bad shares");
        uint256 amount = (shares * assets) / totalShares;
        require(assets - amount >= reserved, "Funds reserved for cover");
        sharesOf[msg.sender] -= shares;
        totalShares -= shares;
        assets -= amount;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "Transfer failed");
        emit WithdrawnShares(msg.sender, amount, shares);
    }

    // ------------------------------------------------------------------ views

    function getPolicy(bytes32 id)
        external
        view
        returns (address insured, uint256 cover, uint64 start, uint64 end, bool settled, uint8 phase)
    {
        Policy storage p = _policies[id];
        uint8 ph;
        if (p.insured == address(0)) ph = 0;
        else if (p.settled) ph = 4;                                   // claimed or released
        else if (block.timestamp < p.end) ph = 1;                     // covered now
        else if (block.timestamp <= uint256(p.end) + CLAIM_WINDOW) ph = 2; // ended, claim still possible
        else ph = 3;                                                  // ended, window closed
        return (p.insured, p.cover, p.start, p.end, p.settled, ph);
    }

    /// @notice MON an underwriter's shares are worth today, and how much of that can leave now.
    function positionOf(address who) external view returns (uint256 value, uint256 withdrawable) {
        if (totalShares == 0) return (0, 0);
        value = (sharesOf[who] * assets) / totalShares;
        uint256 free = assets > reserved ? assets - reserved : 0;
        withdrawable = value < free ? value : free;
    }

    function capacity() external view returns (uint256) {
        return assets > reserved ? assets - reserved : 0;
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("FabrikaCover"), keccak256("1"), block.chainid, address(this)));
    }

    function claimDigest(bytes32 id, address insured, uint256 payout, uint256 deadline) public view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(CLAIM_TYPEHASH, id, insured, payout, deadline));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    function _recover(bytes32 digest, bytes calldata sig) private pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (uint256(s) > HALF_N) return address(0);
        if (v != 27 && v != 28) return address(0);
        return ecrecover(digest, v, r, s);
    }
}
