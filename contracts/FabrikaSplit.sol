// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title FabrikaSplit
/// @notice Split a bill. The creator sets one amount per share. Each person pays their own
///         share from one link. Money goes straight to the creator. The contract never holds funds.
contract FabrikaSplit {
    enum Status { None, Open, Complete, Cancelled, Expired }

    struct Split {
        address creator;
        uint64 expiresAt; // 0 means no deadline
        uint32 count;
        uint32 paidCount;
        bool cancelled;
        string note;
    }

    struct Slot {
        uint256 amount;
        address payer;
    }

    uint256 public constant MAX_SLOTS = 50;
    uint256 public constant MAX_NOTE_BYTES = 120;

    mapping(bytes32 => Split) private _splits;
    mapping(bytes32 => mapping(uint256 => Slot)) private _slots;

    event SplitCreated(bytes32 indexed id, address indexed creator, uint256 count, uint256 total);
    event SharePaid(bytes32 indexed id, uint256 indexed slot, address indexed payer, uint256 amount);
    event SplitCancelled(bytes32 indexed id);

    function createSplit(bytes32 id, uint256[] calldata amounts, uint64 expiresAt, string calldata note) external {
        uint256 n = amounts.length;
        require(id != bytes32(0), "Bad id");
        require(_splits[id].creator == address(0), "Split exists");
        require(n > 0 && n <= MAX_SLOTS, "Bad count");
        require(expiresAt == 0 || expiresAt > block.timestamp, "Bad expiry");
        require(bytes(note).length <= MAX_NOTE_BYTES, "Note too long");

        uint256 total;
        for (uint256 i = 0; i < n; ++i) {
            require(amounts[i] > 0, "Bad amount");
            _slots[id][i].amount = amounts[i];
            total += amounts[i];
        }
        Split storage s = _splits[id];
        s.creator = msg.sender;
        s.expiresAt = expiresAt;
        s.count = uint32(n);
        s.note = note;
        emit SplitCreated(id, msg.sender, n, total);
    }

    /// @notice Pay one share. The caller picks a slot that is still unpaid.
    function payShare(bytes32 id, uint256 slot) external payable {
        Split storage s = _splits[id];
        require(s.creator != address(0), "No split");
        require(!s.cancelled, "Cancelled");
        require(s.expiresAt == 0 || block.timestamp < s.expiresAt, "Expired");
        require(slot < s.count, "Bad slot");
        Slot storage sl = _slots[id][slot];
        require(sl.payer == address(0), "Already paid");
        require(msg.value == sl.amount, "Wrong amount");
        require(msg.sender != s.creator, "Creator cannot pay");

        sl.payer = msg.sender;
        s.paidCount += 1;

        (bool ok, ) = s.creator.call{value: msg.value}("");
        require(ok, "Transfer failed");
        emit SharePaid(id, slot, msg.sender, msg.value);
    }

    /// @notice Stop an unfinished split. Shares already paid stay with the creator.
    function cancel(bytes32 id) external {
        Split storage s = _splits[id];
        require(s.creator == msg.sender, "Not creator");
        require(!s.cancelled && s.paidCount < s.count, "Not open");
        s.cancelled = true;
        emit SplitCancelled(id);
    }

    function getSplit(bytes32 id)
        external
        view
        returns (address creator, uint64 expiresAt, uint32 count, uint32 paidCount, Status status, string memory note)
    {
        Split storage s = _splits[id];
        if (s.creator == address(0)) status = Status.None;
        else if (s.cancelled) status = Status.Cancelled;
        else if (s.paidCount == s.count) status = Status.Complete;
        else if (s.expiresAt != 0 && block.timestamp >= s.expiresAt) status = Status.Expired;
        else status = Status.Open;
        return (s.creator, s.expiresAt, s.count, s.paidCount, status, s.note);
    }

    function getSlot(bytes32 id, uint256 slot) external view returns (uint256 amount, address payer) {
        Slot storage sl = _slots[id][slot];
        return (sl.amount, sl.payer);
    }
}
