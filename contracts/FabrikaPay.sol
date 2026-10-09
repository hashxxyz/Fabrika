// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title FabrikaPay
/// @notice On-chain payment requests. A creator opens a request for an exact
///         amount of MON. Anyone can pay it once, before it expires, and the
///         MON goes straight to the creator. The contract never holds funds.
contract FabrikaPay {
    enum Status { None, Open, Paid, Cancelled, Expired }

    struct Request {
        address recipient;   // creator, receives the MON
        Status status;       // stored as None, Open, Paid or Cancelled
        uint64 expiresAt;    // 0 means the request never expires
        uint64 paidAt;
        uint64 paidBlock;
        address payer;
        uint256 amount;      // exact amount in wei
        string note;
    }

    uint256 public constant MAX_NOTE_BYTES = 120;

    mapping(bytes32 => Request) private _requests;

    event RequestCreated(bytes32 indexed id, address indexed recipient, uint256 amount, uint64 expiresAt, string note);
    event Paid(bytes32 indexed id, address indexed payer, address indexed recipient, uint256 amount);
    event Cancelled(bytes32 indexed id, address indexed recipient);

    /// @notice Open a payment request. The id is chosen by the caller (random 32 bytes).
    function createRequest(bytes32 id, uint256 amount, uint64 expiresAt, string calldata note) external {
        require(id != bytes32(0), "Bad id");
        require(_requests[id].status == Status.None, "Request exists");
        require(amount > 0, "Bad amount");
        require(expiresAt == 0 || expiresAt > block.timestamp, "Bad expiry");
        require(bytes(note).length <= MAX_NOTE_BYTES, "Note too long");

        _requests[id] = Request({
            recipient: msg.sender,
            status: Status.Open,
            expiresAt: expiresAt,
            paidAt: 0,
            paidBlock: 0,
            payer: address(0),
            amount: amount,
            note: note
        });

        emit RequestCreated(id, msg.sender, amount, expiresAt, note);
    }

    /// @notice Pay an open request with the exact amount. Works once per request.
    function pay(bytes32 id) external payable {
        Request storage r = _requests[id];
        require(r.status == Status.Open, "Not open");
        require(r.expiresAt == 0 || block.timestamp < r.expiresAt, "Expired");
        require(msg.value == r.amount, "Wrong amount");

        // Effects before the transfer, so the request cannot be paid twice.
        r.status = Status.Paid;
        r.payer = msg.sender;
        r.paidAt = uint64(block.timestamp);
        r.paidBlock = uint64(block.number);

        (bool ok, ) = r.recipient.call{value: msg.value}("");
        require(ok, "Transfer failed");

        emit Paid(id, msg.sender, r.recipient, msg.value);
    }

    /// @notice Cancel an open request. Only the creator can do this.
    function cancel(bytes32 id) external {
        Request storage r = _requests[id];
        require(r.status == Status.Open, "Not open");
        require(msg.sender == r.recipient, "Not creator");
        r.status = Status.Cancelled;
        emit Cancelled(id, msg.sender);
    }

    /// @notice Read a request. Status is Expired if it was open and its time has passed.
    function getRequest(bytes32 id)
        external
        view
        returns (
            address recipient,
            uint256 amount,
            uint64 expiresAt,
            Status status,
            address payer,
            uint64 paidAt,
            uint64 paidBlock
        )
    {
        Request storage r = _requests[id];
        status = r.status;
        if (status == Status.Open && r.expiresAt != 0 && block.timestamp >= r.expiresAt) {
            status = Status.Expired;
        }
        return (r.recipient, r.amount, r.expiresAt, status, r.payer, r.paidAt, r.paidBlock);
    }

    /// @notice Read the note of a request.
    function noteOf(bytes32 id) external view returns (string memory) {
        return _requests[id].note;
    }
}
