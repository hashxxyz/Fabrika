// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title FabrikaSavings
/// @notice Savings where your rate depends on a goal your friends confirm. Lock MON, name the
///         friends who can verify your goal and how many must agree. Until the goal is confirmed you
///         earn the base rate. From the moment enough friends confirm, you earn the boosted rate.
/// @dev The yield is NOT from outside lending. It is paid from a rewards pool that anyone can fund
///      (sponsors, or forfeited stakes sent here from FabrikaPledge, since this contract accepts
///      plain transfers). If the pool runs dry, yield is paid up to what is left. Principal is
///      never touched by yield payments and can be withdrawn at any time.
/// @dev WARNING: the boost depends on verifiers the owner picks. Nothing stops an owner naming their own
///      second wallet, so the boost can be farmed and the rewards pool drained first come first served.
///      Use only with verifiers you trust, or keep the pool small. This is a design limit, not a code bug.
contract FabrikaSavings {
    struct Account {
        address owner;
        uint64 since;
        uint64 goalBy;
        uint64 metAt;
        uint8 threshold;
        uint8 attestations;
        bool closed;
        uint256 principal;
        string goal;
    }

    uint256 public constant YEAR = 365 days;
    uint256 public constant MAX_VERIFIERS = 10;
    uint256 public constant MAX_GOAL_BYTES = 120;

    /// @notice Yearly rates in basis points. 500 = 5%.
    uint256 public immutable baseBps;
    uint256 public immutable boostBps;

    uint256 public rewards;
    mapping(bytes32 => Account) private _accounts;
    mapping(bytes32 => address[]) private _verifiers;
    mapping(bytes32 => mapping(address => bool)) private _isVerifier;
    mapping(bytes32 => mapping(address => bool)) private _attested;
    uint256 private _lock = 1;

    event Opened(bytes32 indexed id, address indexed owner, uint256 principal, uint64 goalBy);
    event Attested(bytes32 indexed id, address indexed verifier, uint8 count);
    event GoalMet(bytes32 indexed id, uint64 at);
    event Closed(bytes32 indexed id, uint256 principal, uint256 yield_);
    event RewardsFunded(address indexed from, uint256 amount);

    modifier nonReentrant() {
        require(_lock == 1, "Reentrancy");
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(uint256 baseBps_, uint256 boostBps_) {
        require(baseBps_ <= boostBps_ && boostBps_ <= 10000, "Bad rates");
        baseBps = baseBps_;
        boostBps = boostBps_;
    }

    receive() external payable {
        rewards += msg.value;
        emit RewardsFunded(msg.sender, msg.value);
    }

    function fundRewards() external payable {
        require(msg.value > 0, "No amount");
        rewards += msg.value;
        emit RewardsFunded(msg.sender, msg.value);
    }

    function open(bytes32 id, address[] calldata verifiers, uint8 threshold, uint64 goalBy, string calldata goal)
        external
        payable
        nonReentrant
    {
        require(id != bytes32(0), "Bad id");
        require(_accounts[id].owner == address(0), "Account exists");
        require(msg.value > 0, "No deposit");
        require(verifiers.length > 0 && verifiers.length <= MAX_VERIFIERS, "Bad verifiers");
        require(threshold > 0 && threshold <= verifiers.length, "Bad threshold");
        require(goalBy > block.timestamp, "Bad deadline");
        require(bytes(goal).length <= MAX_GOAL_BYTES, "Goal too long");

        for (uint256 i = 0; i < verifiers.length; ++i) {
            address v = verifiers[i];
            require(v != address(0) && v != msg.sender, "Bad verifier");
            require(!_isVerifier[id][v], "Duplicate verifier");
            _isVerifier[id][v] = true;
            _verifiers[id].push(v);
        }

        Account storage a = _accounts[id];
        a.owner = msg.sender;
        a.since = uint64(block.timestamp);
        a.goalBy = goalBy;
        a.threshold = threshold;
        a.principal = msg.value;
        a.goal = goal;
        emit Opened(id, msg.sender, msg.value, goalBy);
    }

    /// @notice A named friend confirms the goal. Counts only before the deadline.
    function attest(bytes32 id) external {
        Account storage a = _accounts[id];
        require(a.owner != address(0) && !a.closed, "Not open");
        require(_isVerifier[id][msg.sender], "Not a verifier");
        require(!_attested[id][msg.sender], "Already confirmed");
        require(block.timestamp <= a.goalBy, "Deadline passed");
        _attested[id][msg.sender] = true;
        a.attestations += 1;
        emit Attested(id, msg.sender, a.attestations);
        if (a.metAt == 0 && a.attestations >= a.threshold) {
            a.metAt = uint64(block.timestamp);
            emit GoalMet(id, a.metAt);
        }
    }

    /// @notice Take out principal plus the yield earned so far. Closes the account.
    function withdraw(bytes32 id) external nonReentrant {
        Account storage a = _accounts[id];
        require(msg.sender == a.owner, "Not owner");
        require(!a.closed, "Closed");
        uint256 y = _pending(a);
        if (y > rewards) y = rewards;
        a.closed = true;
        rewards -= y;
        uint256 total = a.principal + y;
        (bool ok, ) = msg.sender.call{value: total}("");
        require(ok, "Transfer failed");
        emit Closed(id, a.principal, y);
    }

    function _pending(Account storage a) private view returns (uint256) {
        if (a.closed) return 0;
        uint256 base = (a.principal * baseBps * (block.timestamp - a.since)) / (10000 * YEAR);
        uint256 boost;
        if (a.metAt != 0) {
            boost = (a.principal * (boostBps - baseBps) * (block.timestamp - a.metAt)) / (10000 * YEAR);
        }
        return base + boost;
    }

    // ------------------------------------------------------------------ views

    function getAccount(bytes32 id) external view returns (address owner, uint256 principal, uint64 since, uint64 goalBy) {
        Account storage a = _accounts[id];
        return (a.owner, a.principal, a.since, a.goalBy);
    }

    function progressOf(bytes32 id) external view returns (uint64 metAt, uint8 threshold, uint8 attestations, bool closed) {
        Account storage a = _accounts[id];
        return (a.metAt, a.threshold, a.attestations, a.closed);
    }

    function goalOf(bytes32 id) external view returns (string memory) {
        return _accounts[id].goal;
    }

    function verifiersOf(bytes32 id) external view returns (address[] memory) {
        return _verifiers[id];
    }

    function hasAttested(bytes32 id, address who) external view returns (bool) {
        return _attested[id][who];
    }

    /// @notice Yield earned so far, capped by what the rewards pool can pay.
    function pendingYield(bytes32 id) external view returns (uint256) {
        uint256 y = _pending(_accounts[id]);
        return y > rewards ? rewards : y;
    }
}
