// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title FabrikaStream
/// @notice Pay by the second. The payer locks the full amount up front for a period. The recipient
///         can withdraw whatever has streamed so far at any moment. The payer can stop early and
///         get back only what has not streamed yet.
contract FabrikaStream {
    struct Stream {
        address payer;
        address recipient;
        uint64 start;
        uint64 stop;
        uint64 cancelledAt;
        bool cancelled;
        uint256 rate;      // wei per second
        uint256 withdrawn;
        string note;
    }

    uint256 public constant MAX_NOTE_BYTES = 80;

    mapping(bytes32 => Stream) private _streams;
    uint256 private _lock = 1;

    event StreamCreated(bytes32 indexed id, address indexed payer, address indexed recipient, uint256 rate);
    event Withdrawn(bytes32 indexed id, address indexed recipient, uint256 amount);
    event StreamCancelled(bytes32 indexed id, uint256 paidToRecipient, uint256 returnedToPayer);

    modifier nonReentrant() {
        require(_lock == 1, "Reentrancy");
        _lock = 2;
        _;
        _lock = 1;
    }

    /// @param id Random unique id.
    /// @param start Unix time the stream begins (0 means now).
    /// @param stop Unix time the stream ends. msg.value must equal rate * (stop - start).
    function createStream(bytes32 id, address recipient, uint256 rate, uint64 start, uint64 stop, string calldata note)
        external
        payable
        nonReentrant
    {
        require(id != bytes32(0), "Bad id");
        require(_streams[id].payer == address(0), "Stream exists");
        require(recipient != address(0) && recipient != msg.sender, "Bad recipient");
        require(rate > 0, "Bad rate");
        if (start == 0) start = uint64(block.timestamp);
        require(start + 60 >= block.timestamp, "Start in the past");
        require(stop > start, "Bad stop");
        require(msg.value == rate * (stop - start), "Wrong deposit");
        require(bytes(note).length <= MAX_NOTE_BYTES, "Note too long");

        Stream storage s = _streams[id];
        s.payer = msg.sender;
        s.recipient = recipient;
        s.start = start;
        s.stop = stop;
        s.rate = rate;
        s.note = note;
        emit StreamCreated(id, msg.sender, recipient, rate);
    }

    function withdraw(bytes32 id) external nonReentrant {
        Stream storage s = _streams[id];
        require(s.payer != address(0), "No stream");
        require(msg.sender == s.recipient, "Not recipient");
        uint256 amount = _streamed(s) - s.withdrawn;
        require(amount > 0, "Nothing yet");
        s.withdrawn += amount;
        _send(s.recipient, amount);
        emit Withdrawn(id, s.recipient, amount);
    }

    /// @notice The payer stops the stream. The recipient is paid what has streamed so far. The rest goes back.
    function cancel(bytes32 id) external nonReentrant {
        Stream storage s = _streams[id];
        require(msg.sender == s.payer, "Not payer");
        require(!s.cancelled && block.timestamp < s.stop, "Not running");
        uint256 total = s.rate * (s.stop - s.start);
        s.cancelled = true;
        s.cancelledAt = uint64(block.timestamp);
        uint256 streamed = _streamed(s);
        uint256 toRecipient = streamed - s.withdrawn;
        uint256 toPayer = total - streamed;
        s.withdrawn = streamed;
        if (toRecipient > 0) _send(s.recipient, toRecipient);
        if (toPayer > 0) _send(s.payer, toPayer);
        emit StreamCancelled(id, toRecipient, toPayer);
    }

    function _streamed(Stream storage s) private view returns (uint256) {
        uint256 t = s.cancelled ? s.cancelledAt : block.timestamp;
        if (t <= s.start) return 0;
        if (t > s.stop) t = s.stop;
        return s.rate * (t - s.start);
    }

    function getStream(bytes32 id)
        external
        view
        returns (address payer, address recipient, uint256 rate, uint64 start, uint64 stop)
    {
        Stream storage s = _streams[id];
        return (s.payer, s.recipient, s.rate, s.start, s.stop);
    }

    function progressOf(bytes32 id) external view returns (bool cancelled, uint256 streamed, uint256 withdrawn) {
        Stream storage s = _streams[id];
        return (s.cancelled, _streamed(s), s.withdrawn);
    }

    function noteOf(bytes32 id) external view returns (string memory) {
        return _streams[id].note;
    }

    function _send(address to, uint256 amount) private {
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "Transfer failed");
    }
}
