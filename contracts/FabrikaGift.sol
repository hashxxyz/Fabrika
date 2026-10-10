// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title FabrikaGift
/// @notice Gifts that unlock on conditions. Lock MON for a person (a wallet) or for whoever holds
///         a gift link (bearer). Conditions: a date, an approver who must sign off, or both.
///         Named recipients are paid by anyone calling `release`, so nobody has to chase anyone.
/// @dev Bearer gifts store the address of a throwaway key that lives in the link. The claimer
///      signs their own address with that key, so a copied transaction cannot be front-run.
contract FabrikaGift {
    enum Status { None, Open, Released, Cancelled, Refunded }

    struct Gift {
        address sender;
        address recipient; // zero for bearer gifts
        address claimKey;  // zero for named gifts
        address approver;  // zero means no approval needed
        uint64 unlockAt;   // zero means no date
        uint64 expiresAt;  // zero means the sender can never take it back
        bool approved;
        bool revocable;
        Status status;
        uint256 amount;
        string note;
    }

    uint256 public constant MAX_NOTE_BYTES = 120;
    uint256 private constant HALF_N = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    mapping(bytes32 => Gift) private _gifts;
    uint256 private _lock = 1;

    event GiftCreated(bytes32 indexed id, address indexed sender, address recipient, uint256 amount);
    event Approved(bytes32 indexed id, address indexed approver);
    event Released(bytes32 indexed id, address indexed to, uint256 amount);
    event Cancelled(bytes32 indexed id);
    event Refunded(bytes32 indexed id);

    modifier nonReentrant() {
        require(_lock == 1, "Reentrancy");
        _lock = 2;
        _;
        _lock = 1;
    }

    function createGift(
        bytes32 id,
        address recipient,
        address claimKey,
        address approver,
        uint64 unlockAt,
        uint64 expiresAt,
        bool revocable,
        string calldata note
    ) external payable nonReentrant {
        require(id != bytes32(0), "Bad id");
        require(_gifts[id].status == Status.None, "Gift exists");
        require(msg.value > 0, "No amount");
        require((recipient != address(0)) != (claimKey != address(0)), "Pick one recipient type");
        require(recipient != msg.sender, "Cannot gift yourself");
        require(approver != msg.sender, "Sender cannot approve");
        require(unlockAt == 0 || unlockAt > block.timestamp, "Bad unlock");
        require(expiresAt == 0 || (expiresAt > block.timestamp && expiresAt > unlockAt), "Bad expiry");
        require(bytes(note).length <= MAX_NOTE_BYTES, "Note too long");

        // Field by field: a struct literal with this many values would run out of stack.
        Gift storage g = _gifts[id];
        g.sender = msg.sender;
        g.recipient = recipient;
        g.claimKey = claimKey;
        g.approver = approver;
        g.unlockAt = unlockAt;
        g.expiresAt = expiresAt;
        g.revocable = revocable;
        g.status = Status.Open;
        g.amount = msg.value;
        g.note = note;
        emit GiftCreated(id, msg.sender, recipient, msg.value);
    }

    /// @notice The approver confirms the condition was met (graduated, company exited, and so on).
    function approve(bytes32 id) external {
        Gift storage g = _gifts[id];
        require(g.status == Status.Open, "Not open");
        require(g.approver != address(0) && msg.sender == g.approver, "Not approver");
        require(!g.approved, "Already approved");
        require(g.expiresAt == 0 || block.timestamp < g.expiresAt, "Expired");
        g.approved = true;
        emit Approved(id, msg.sender);
    }

    /// @notice Pay a named recipient once every condition is met. Anyone can call this.
    function release(bytes32 id) external nonReentrant {
        Gift storage g = _gifts[id];
        require(g.status == Status.Open, "Not open");
        require(g.recipient != address(0), "Bearer gift");
        require(_ready(g), "Not ready");
        _pay(id, g, g.recipient);
    }

    /// @notice Bearer gift: the link holder signs their own address with the key from the link.
    function claim(bytes32 id, bytes calldata signature) external nonReentrant {
        Gift storage g = _gifts[id];
        require(g.status == Status.Open, "Not open");
        require(g.claimKey != address(0), "Named gift");
        require(_ready(g), "Not ready");
        require(_recover(claimDigest(id, msg.sender), signature) == g.claimKey, "Bad key");
        _pay(id, g, msg.sender);
    }

    /// @notice Sender takes the gift back before it is released. Only if the sender made it revocable.
    function cancel(bytes32 id) external nonReentrant {
        Gift storage g = _gifts[id];
        require(g.status == Status.Open, "Not open");
        require(msg.sender == g.sender, "Not sender");
        require(g.revocable, "Not revocable");
        g.status = Status.Cancelled;
        _send(g.sender, g.amount);
        emit Cancelled(id);
    }

    /// @notice After the expiry date, an unreleased gift goes back to the sender. Anyone can call this.
    function refund(bytes32 id) external nonReentrant {
        Gift storage g = _gifts[id];
        require(g.status == Status.Open, "Not open");
        require(g.expiresAt != 0 && block.timestamp >= g.expiresAt, "Not expired");
        g.status = Status.Refunded;
        _send(g.sender, g.amount);
        emit Refunded(id);
    }

    function _ready(Gift storage g) private view returns (bool) {
        if (g.unlockAt != 0 && block.timestamp < g.unlockAt) return false;
        if (g.approver != address(0) && !g.approved) return false;
        if (g.expiresAt != 0 && block.timestamp >= g.expiresAt) return false;
        return true;
    }

    function _pay(bytes32 id, Gift storage g, address to) private {
        g.status = Status.Released; // effects before interaction
        _send(to, g.amount);
        emit Released(id, to, g.amount);
    }

    // ------------------------------------------------------------------ views

    function getGift(bytes32 id)
        external
        view
        returns (address sender, address recipient, uint256 amount, uint64 unlockAt, uint64 expiresAt, Status status)
    {
        Gift storage g = _gifts[id];
        return (g.sender, g.recipient, g.amount, g.unlockAt, g.expiresAt, g.status);
    }

    function conditionsOf(bytes32 id)
        external
        view
        returns (address approver, bool approved, bool revocable, bool bearer, bool ready, string memory note)
    {
        Gift storage g = _gifts[id];
        return (g.approver, g.approved, g.revocable, g.claimKey != address(0), g.status == Status.Open && _ready(g), g.note);
    }

    /// @notice The message the link key must sign (with the standard personal-sign prefix).
    function claimDigest(bytes32 id, address claimer) public view returns (bytes32) {
        bytes32 inner = keccak256(abi.encode(address(this), block.chainid, id, claimer));
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", inner));
    }

    function _send(address to, uint256 amount) private {
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "Transfer failed");
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
