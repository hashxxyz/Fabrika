// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title FabrikaPledge
/// @notice Put money behind a goal. One contract covers two products:
///         1. Commitment contract: one member, stake locked until a judge reports the result.
///            If you fail, the stake goes to the beneficiary you chose.
///         2. Accountability pool: many members stake the same amount. Members who succeed
///            split the stakes of members who failed, on top of getting their own stake back.
/// @dev The judge is a person or a bot wallet chosen by the creator. The judge is a trust
///      assumption: it decides who succeeded. If the judge does nothing for GRACE after the
///      end time, everyone can take their own stake back. There is no owner and no admin.
contract FabrikaPledge {
    enum Status { None, Open, Resolved }
    // Derived phase for views: 0 none, 1 joining, 2 running, 3 waiting for judge, 4 resolved, 5 void
    uint256 public constant GRACE = 7 days;
    uint256 public constant MAX_MEMBERS = 50;
    uint256 public constant MAX_TITLE_BYTES = 120;

    struct Pool {
        address creator;
        address judge;
        address beneficiary;
        uint64 joinBy;
        uint64 endsAt;
        uint32 count;
        uint32 winners;
        Status status;
        bool swept;
        uint256 stake;
        string title;
    }

    mapping(bytes32 => Pool) private _pools;
    mapping(bytes32 => address[]) private _members;
    // 0 not a member, 1 member, 2 winner, 3 paid out
    mapping(bytes32 => mapping(address => uint8)) private _state;
    uint256 private _lock = 1;

    event PoolCreated(bytes32 indexed id, address indexed creator, address indexed judge, uint256 stake);
    event Joined(bytes32 indexed id, address indexed member);
    event Resolved(bytes32 indexed id, uint256 winners, uint256 members);
    event Withdrawn(bytes32 indexed id, address indexed member, uint256 amount);
    event Forfeited(bytes32 indexed id, address indexed beneficiary, uint256 amount);

    modifier nonReentrant() {
        require(_lock == 1, "Reentrancy");
        _lock = 2;
        _;
        _lock = 1;
    }

    /// @notice Create a pool and stake as its first member. msg.value is the stake every member pays.
    function createPool(
        bytes32 id,
        address judge,
        address beneficiary,
        uint64 joinBy,
        uint64 endsAt,
        string calldata title
    ) external payable nonReentrant {
        require(id != bytes32(0), "Bad id");
        require(_pools[id].status == Status.None, "Pool exists");
        require(msg.value > 0, "No stake");
        require(judge != address(0) && judge != msg.sender, "Bad judge");
        require(beneficiary != address(0), "Bad beneficiary");
        require(endsAt > block.timestamp && joinBy <= endsAt, "Bad times");
        require(bytes(title).length <= MAX_TITLE_BYTES, "Title too long");

        // Field by field: a struct literal with this many values would run out of stack.
        Pool storage p = _pools[id];
        p.creator = msg.sender;
        p.judge = judge;
        p.beneficiary = beneficiary;
        p.joinBy = joinBy;
        p.endsAt = endsAt;
        p.count = 1;
        p.status = Status.Open;
        p.stake = msg.value;
        p.title = title;
        _members[id].push(msg.sender);
        _state[id][msg.sender] = 1;
        emit PoolCreated(id, msg.sender, judge, msg.value);
        emit Joined(id, msg.sender);
    }

    function join(bytes32 id) external payable nonReentrant {
        Pool storage p = _pools[id];
        require(p.status == Status.Open, "Not open");
        require(block.timestamp < p.joinBy, "Joining closed");
        require(msg.value == p.stake, "Wrong stake");
        require(_state[id][msg.sender] == 0, "Already in");
        require(msg.sender != p.judge, "Judge cannot join");
        require(p.count < MAX_MEMBERS, "Pool full");
        p.count += 1;
        _members[id].push(msg.sender);
        _state[id][msg.sender] = 1;
        emit Joined(id, msg.sender);
    }

    /// @notice The judge lists who succeeded. Anyone not listed lost their stake.
    ///         Only between the end time and the end of the grace period.
    function resolve(bytes32 id, address[] calldata winners) external nonReentrant {
        Pool storage p = _pools[id];
        require(p.status == Status.Open, "Not open");
        require(msg.sender == p.judge, "Not judge");
        require(block.timestamp >= p.endsAt, "Not ended");
        require(block.timestamp <= uint256(p.endsAt) + GRACE, "Judge window closed");
        for (uint256 i = 0; i < winners.length; ++i) {
            require(_state[id][winners[i]] == 1, "Bad winner");
            _state[id][winners[i]] = 2;
        }
        p.winners = uint32(winners.length);
        p.status = Status.Resolved;
        emit Resolved(id, winners.length, p.count);
    }

    /// @notice Take your money. Winners get their stake plus an equal share of forfeited stakes.
    ///         If the judge never resolved and the grace period passed, everyone gets their stake back.
    function withdraw(bytes32 id) external nonReentrant {
        Pool storage p = _pools[id];
        uint8 s = _state[id][msg.sender];
        require(s == 1 || s == 2, "Nothing to withdraw");
        uint256 amount;
        if (p.status == Status.Resolved) {
            require(s == 2, "Not a winner");
            amount = p.stake + (p.stake * (p.count - p.winners)) / p.winners;
        } else {
            require(block.timestamp > uint256(p.endsAt) + GRACE, "Not settled");
            amount = p.stake;
        }
        _state[id][msg.sender] = 3;
        _send(msg.sender, amount);
        emit Withdrawn(id, msg.sender, amount);
    }

    /// @notice If nobody succeeded, send all stakes to the beneficiary. Anyone can trigger it.
    function sweep(bytes32 id) external nonReentrant {
        Pool storage p = _pools[id];
        require(p.status == Status.Resolved && p.winners == 0, "Nothing to sweep");
        require(!p.swept, "Already swept");
        p.swept = true;
        uint256 amount = p.stake * p.count;
        _send(p.beneficiary, amount);
        emit Forfeited(id, p.beneficiary, amount);
    }

    function _phase(Pool storage p) private view returns (uint8) {
        if (p.status == Status.None) return 0;
        if (p.status == Status.Resolved) return 4;
        if (block.timestamp < p.joinBy) return 1;
        if (block.timestamp < p.endsAt) return 2;
        if (block.timestamp <= uint256(p.endsAt) + GRACE) return 3;
        return 5;
    }

    function getPool(bytes32 id)
        external
        view
        returns (address creator, address judge, address beneficiary, uint256 stake, uint8 phase)
    {
        Pool storage p = _pools[id];
        return (p.creator, p.judge, p.beneficiary, p.stake, _phase(p));
    }

    function timesOf(bytes32 id) external view returns (uint64 joinBy, uint64 endsAt, uint32 count, uint32 winners) {
        Pool storage p = _pools[id];
        return (p.joinBy, p.endsAt, p.count, p.winners);
    }

    function titleOf(bytes32 id) external view returns (string memory) {
        return _pools[id].title;
    }

    function membersOf(bytes32 id) external view returns (address[] memory) {
        return _members[id];
    }

    /// @notice 0 not a member, 1 member, 2 winner, 3 paid out
    function stateOf(bytes32 id, address who) external view returns (uint8) {
        return _state[id][who];
    }

    function _send(address to, uint256 amount) private {
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "Transfer failed");
    }
}
