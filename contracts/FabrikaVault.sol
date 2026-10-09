// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title FabrikaVault
/// @notice Escrow for batch payouts. A sender locks the exact total in native MON and
///         assigns amounts to opaque recipient tags (hash of a Telegram username).
///         A recipient claims by presenting a short-lived EIP-712 authorization signed
///         by the `authorizer` (the Fabrika backend). The authorization binds ONE
///         allocation, its recipient tag, ONE destination wallet, a deadline, this
///         chain and this contract.
/// @dev The authorizer can never move funds on its own, change an amount, or change a
///      recipient tag: those are fixed at creation. It can only choose the destination
///      for an allocation that is still open. That trust assumption is real, so the
///      backend must only sign after verifying the Telegram identity.
///      No owner, no admin, no receive/fallback. Authorizer is immutable (rotate by redeploy).
contract FabrikaVault {
    enum Status { None, Open, Claimed, Cancelled, Refunded, Expired } // Expired is derived in views only

    struct Batch {
        address sender;
        uint64 expiresAt;
    }

    struct Allocation {
        bytes32 batchId;
        bytes32 recipientTag; // keccak256 of the normalized Telegram username, supplied by the sender
        uint256 amount;
        Status status;
    }

    uint256 public constant MAX_ALLOCATIONS = 100;

    bytes32 public constant CLAIM_TYPEHASH =
        keccak256("Claim(bytes32 allocationId,bytes32 recipientTag,address destination,uint256 deadline)");
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    // secp256k1 half order, used to reject malleable signatures
    uint256 private constant HALF_N = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    address public immutable authorizer;

    mapping(bytes32 => Batch) private _batches;
    mapping(bytes32 => Allocation) private _allocations;
    uint256 private _lock = 1;

    event BatchCreated(bytes32 indexed batchId, address indexed sender, uint256 total, uint256 count, uint64 expiresAt);
    event AllocationCreated(bytes32 indexed batchId, bytes32 indexed allocationId, bytes32 recipientTag, uint256 amount);
    event Claimed(bytes32 indexed allocationId, address indexed destination, uint256 amount);
    event Cancelled(bytes32 indexed allocationId, address indexed sender, uint256 amount);
    event Refunded(bytes32 indexed allocationId, address indexed sender, uint256 amount);

    modifier nonReentrant() {
        require(_lock == 1, "Reentrancy");
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address authorizer_) {
        require(authorizer_ != address(0), "Bad authorizer");
        authorizer = authorizer_;
    }

    // ---------------------------------------------------------------- create

    /// @notice Lock funds and create allocations. msg.value must equal the sum of amounts.
    /// @param batchId Unique id for the batch (random 32 bytes).
    /// @param allocationIds Unique random id per allocation.
    /// @param recipientTags keccak256 of each normalized Telegram username.
    /// @param amounts Amount in wei per allocation.
    /// @param expiresAt Unix time after which claims stop and the sender can refund.
    function createBatch(
        bytes32 batchId,
        bytes32[] calldata allocationIds,
        bytes32[] calldata recipientTags,
        uint256[] calldata amounts,
        uint64 expiresAt
    ) external payable nonReentrant {
        uint256 n = allocationIds.length;
        require(batchId != bytes32(0), "Bad id");
        require(_batches[batchId].sender == address(0), "Batch exists");
        require(n > 0 && n <= MAX_ALLOCATIONS, "Bad count");
        require(recipientTags.length == n && amounts.length == n, "Length mismatch");
        require(expiresAt > block.timestamp, "Bad expiry");

        _batches[batchId] = Batch({sender: msg.sender, expiresAt: expiresAt});

        uint256 total;
        for (uint256 i = 0; i < n; ++i) {
            bytes32 id = allocationIds[i];
            require(id != bytes32(0), "Bad id");
            require(_allocations[id].status == Status.None, "Allocation exists");
            require(amounts[i] > 0, "Bad amount");
            require(recipientTags[i] != bytes32(0), "Bad tag");

            _allocations[id] = Allocation({
                batchId: batchId,
                recipientTag: recipientTags[i],
                amount: amounts[i],
                status: Status.Open
            });
            total += amounts[i];
            emit AllocationCreated(batchId, id, recipientTags[i], amounts[i]);
        }

        require(msg.value == total, "Wrong total");
        emit BatchCreated(batchId, msg.sender, total, n, expiresAt);
    }

    // ----------------------------------------------------------------- claim

    /// @notice Release one allocation to `destination` using the authorizer's signature.
    ///         Anyone may submit the transaction; funds only ever go to `destination`.
    function claim(bytes32 allocationId, address destination, uint256 deadline, bytes calldata signature)
        external
        nonReentrant
    {
        Allocation storage a = _allocations[allocationId];
        require(a.status == Status.Open, "Not open");
        require(block.timestamp < _batches[a.batchId].expiresAt, "Expired");
        require(block.timestamp <= deadline, "Authorization expired");
        require(destination != address(0) && destination != address(this), "Bad destination");

        bytes32 digest = claimDigest(allocationId, a.recipientTag, destination, deadline);
        require(_recover(digest, signature) == authorizer, "Bad authorization");

        uint256 amount = a.amount;
        a.status = Status.Claimed; // effects before interaction
        _send(destination, amount);

        emit Claimed(allocationId, destination, amount);
    }

    // ------------------------------------------------------ cancel and refund

    /// @notice Sender takes back an unclaimed allocation at any time before it is claimed.
    function cancel(bytes32 allocationId) external nonReentrant {
        Allocation storage a = _allocations[allocationId];
        require(a.status == Status.Open, "Not open");
        address sender = _batches[a.batchId].sender;
        require(msg.sender == sender, "Not sender");

        uint256 amount = a.amount;
        a.status = Status.Cancelled;
        _send(sender, amount);

        emit Cancelled(allocationId, sender, amount);
    }

    /// @notice After expiry, return an unclaimed allocation to the original sender.
    ///         Anyone may trigger it; funds always go to the sender.
    function refund(bytes32 allocationId) external nonReentrant {
        Allocation storage a = _allocations[allocationId];
        require(a.status == Status.Open, "Not open");
        Batch storage b = _batches[a.batchId];
        require(block.timestamp >= b.expiresAt, "Not expired");

        address sender = b.sender;
        uint256 amount = a.amount;
        a.status = Status.Refunded;
        _send(sender, amount);

        emit Refunded(allocationId, sender, amount);
    }

    // ------------------------------------------------------------------ views

    function getAllocation(bytes32 allocationId)
        external
        view
        returns (
            address sender,
            bytes32 batchId,
            bytes32 recipientTag,
            uint256 amount,
            uint64 expiresAt,
            Status status
        )
    {
        Allocation storage a = _allocations[allocationId];
        Batch storage b = _batches[a.batchId];
        status = a.status;
        if (status == Status.Open && block.timestamp >= b.expiresAt) {
            status = Status.Expired;
        }
        return (b.sender, a.batchId, a.recipientTag, a.amount, b.expiresAt, status);
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("Fabrika"), keccak256("1"), block.chainid, address(this))
        );
    }

    /// @notice The exact digest the authorizer must sign. Also used by the backend and tests.
    function claimDigest(bytes32 allocationId, bytes32 recipientTag, address destination, uint256 deadline)
        public
        view
        returns (bytes32)
    {
        bytes32 structHash = keccak256(abi.encode(CLAIM_TYPEHASH, allocationId, recipientTag, destination, deadline));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    // --------------------------------------------------------------- internals

    function _send(address to, uint256 amount) private {
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "Transfer failed");
    }

    /// @dev Returns address(0) for anything malformed, so the caller's equality check fails.
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
