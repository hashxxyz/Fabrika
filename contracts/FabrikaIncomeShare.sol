// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title FabrikaIncomeShare
/// @notice Fund a friend's course, move or project in return for a share of their future income.
///         Backers fund a target. When it is full the money goes to the beneficiary and the deal
///         starts. Any income paid through `payIncome` is split on the spot: the agreed share goes
///         to backers (pro rata) until a cap, the rest goes to the beneficiary.
/// @dev This only settles income that is routed through the contract. Nothing can force a person
///      to route income here. Backers should fund people they trust. If funding does not fill by
///      the deadline, or the beneficiary cancels while funding, backers take their money back.
contract FabrikaIncomeShare {
    enum Status { None, Funding, Active, Cancelled }

    struct Deal {
        address beneficiary;
        uint16 shareBps;   // share of each payment that goes to backers
        uint16 capBps;     // backers stop at this multiple of what they put in (15000 = 1.5x)
        uint64 fundBy;
        uint64 termSecs;   // how long after activation the share applies
        uint64 activatedAt;
        Status status;
        uint256 target;
        uint256 raised;
        uint256 repaid;
        uint256 acc; // returned per wei funded, scaled by 1e18
        string note;
    }

    uint256 public constant MAX_SHARE_BPS = 5000;
    uint256 public constant MIN_CAP_BPS = 10000;
    uint256 public constant MAX_CAP_BPS = 30000;
    uint256 public constant MAX_NOTE_BYTES = 120;
    uint256 private constant SCALE = 1e18;

    mapping(bytes32 => Deal) private _deals;
    mapping(bytes32 => mapping(address => uint256)) private _funded;
    mapping(bytes32 => mapping(address => uint256)) private _claimed;
    uint256 private _lock = 1;

    event DealCreated(bytes32 indexed id, address indexed beneficiary, uint256 target);
    event Funded(bytes32 indexed id, address indexed backer, uint256 amount, uint256 raised);
    event Activated(bytes32 indexed id, uint256 amount);
    event IncomePaid(bytes32 indexed id, address indexed payer, uint256 amount, uint256 toBackers);
    event ReturnsClaimed(bytes32 indexed id, address indexed backer, uint256 amount);
    event FundingRefunded(bytes32 indexed id, address indexed backer, uint256 amount);
    event DealCancelled(bytes32 indexed id);

    modifier nonReentrant() {
        require(_lock == 1, "Reentrancy");
        _lock = 2;
        _;
        _lock = 1;
    }

    function createDeal(
        bytes32 id,
        uint256 target,
        uint16 shareBps,
        uint16 capBps,
        uint64 fundBy,
        uint64 termSecs,
        string calldata note
    ) external {
        require(id != bytes32(0), "Bad id");
        require(_deals[id].status == Status.None, "Deal exists");
        require(target > 0, "Bad target");
        require(shareBps > 0 && shareBps <= MAX_SHARE_BPS, "Bad share");
        require(capBps >= MIN_CAP_BPS && capBps <= MAX_CAP_BPS, "Bad cap");
        require(fundBy > block.timestamp, "Bad deadline");
        require(termSecs > 0 && termSecs <= 3650 days, "Bad term");
        require(bytes(note).length <= MAX_NOTE_BYTES, "Note too long");

        Deal storage d = _deals[id];
        d.beneficiary = msg.sender;
        d.shareBps = shareBps;
        d.capBps = capBps;
        d.fundBy = fundBy;
        d.termSecs = termSecs;
        d.status = Status.Funding;
        d.target = target;
        d.note = note;
        emit DealCreated(id, msg.sender, target);
    }

    function fund(bytes32 id) external payable nonReentrant {
        Deal storage d = _deals[id];
        require(d.status == Status.Funding, "Not funding");
        require(block.timestamp < d.fundBy, "Funding closed");
        require(msg.value > 0 && d.raised + msg.value <= d.target, "Bad amount");
        require(msg.sender != d.beneficiary, "Beneficiary cannot fund");

        d.raised += msg.value;
        _funded[id][msg.sender] += msg.value;
        emit Funded(id, msg.sender, msg.value, d.raised);

        if (d.raised == d.target) {
            d.status = Status.Active;
            d.activatedAt = uint64(block.timestamp);
            _send(d.beneficiary, d.raised);
            emit Activated(id, d.raised);
        }
    }

    /// @notice Pay income into the deal. Anyone can pay: an employer, a client, or the beneficiary.
    function payIncome(bytes32 id) external payable nonReentrant {
        Deal storage d = _deals[id];
        require(d.status == Status.Active, "Not active");
        require(msg.value > 0, "No amount");

        uint256 share;
        if (block.timestamp <= uint256(d.activatedAt) + d.termSecs) {
            uint256 cap = (d.raised * d.capBps) / 10000;
            uint256 room = cap > d.repaid ? cap - d.repaid : 0;
            share = (msg.value * d.shareBps) / 10000;
            if (share > room) share = room;
        }
        if (share > 0) {
            d.repaid += share;
            d.acc += (share * SCALE) / d.raised;
        }
        emit IncomePaid(id, msg.sender, msg.value, share);
        if (msg.value > share) _send(d.beneficiary, msg.value - share);
    }

    /// @notice A backer collects what their share has earned so far.
    function claimReturns(bytes32 id) external nonReentrant {
        uint256 owed = _owed(id, msg.sender);
        require(owed > 0, "Nothing to claim");
        _claimed[id][msg.sender] += owed;
        _send(msg.sender, owed);
        emit ReturnsClaimed(id, msg.sender, owed);
    }

    /// @notice The beneficiary can stop a deal that is still funding.
    function cancel(bytes32 id) external {
        Deal storage d = _deals[id];
        require(d.status == Status.Funding, "Not funding");
        require(msg.sender == d.beneficiary, "Not beneficiary");
        d.status = Status.Cancelled;
        emit DealCancelled(id);
    }

    /// @notice Backers take their money back if the deal was cancelled or did not fill in time.
    function refundFunding(bytes32 id) external nonReentrant {
        Deal storage d = _deals[id];
        require(d.status == Status.Cancelled || (d.status == Status.Funding && block.timestamp >= d.fundBy), "Not refundable");
        uint256 amount = _funded[id][msg.sender];
        require(amount > 0, "Nothing to refund");
        _funded[id][msg.sender] = 0;
        d.raised -= amount;
        _send(msg.sender, amount);
        emit FundingRefunded(id, msg.sender, amount);
    }

    function _owed(bytes32 id, address who) private view returns (uint256) {
        Deal storage d = _deals[id];
        if (d.status != Status.Active) return 0;
        uint256 earned = (_funded[id][who] * d.acc) / SCALE;
        uint256 got = _claimed[id][who];
        return earned > got ? earned - got : 0;
    }

    /// @dev status: 0 none, 1 funding, 2 active, 3 cancelled, 4 funding window passed without filling
    function getDeal(bytes32 id)
        external
        view
        returns (address beneficiary, uint256 target, uint256 raised, uint256 repaid, uint8 status)
    {
        Deal storage d = _deals[id];
        uint8 st = uint8(d.status);
        if (d.status == Status.Funding && block.timestamp >= d.fundBy) st = 4;
        return (d.beneficiary, d.target, d.raised, d.repaid, st);
    }

    function termsOf(bytes32 id) external view returns (uint16 shareBps, uint16 capBps, uint64 fundBy, uint64 termEndsAt) {
        Deal storage d = _deals[id];
        return (d.shareBps, d.capBps, d.fundBy, d.activatedAt == 0 ? 0 : d.activatedAt + d.termSecs);
    }

    function noteOf(bytes32 id) external view returns (string memory) {
        return _deals[id].note;
    }

    function backerInfo(bytes32 id, address who) external view returns (uint256 funded, uint256 claimable, uint256 claimed) {
        return (_funded[id][who], _owed(id, who), _claimed[id][who]);
    }

    function _send(address to, uint256 amount) private {
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "Transfer failed");
    }
}
