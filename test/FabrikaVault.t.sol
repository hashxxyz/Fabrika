// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {FabrikaVault} from "../contracts/FabrikaVault.sol";

/// Destination that tries to claim again from inside its receive hook.
contract Reenterer {
    FabrikaVault public vault;
    bytes32 public id;
    uint256 public deadline;
    bytes public sig;

    constructor(FabrikaVault v) {
        vault = v;
    }

    function arm(bytes32 id_, uint256 d, bytes calldata s) external {
        id = id_;
        deadline = d;
        sig = s;
    }

    receive() external payable {
        vault.claim(id, address(this), deadline, sig);
    }
}

contract FabrikaVaultTest is Test {
    FabrikaVault vault;

    uint256 signerPk = 0xA11CE;
    uint256 strangerPk = 0xBAD;
    address signer;
    address sender = makeAddr("sender");
    address ada = makeAddr("adaWallet");
    address mallory = makeAddr("mallory");

    bytes32 constant BATCH = keccak256("batch-1");
    bytes32 constant ID_ADA = keccak256("alloc-ada");
    bytes32 constant ID_TUNDE = keccak256("alloc-tunde");
    bytes32 constant ID_MIKE = keccak256("alloc-mike");
    bytes32 constant TAG_ADA = keccak256("@ada");
    bytes32 constant TAG_TUNDE = keccak256("@tunde");
    bytes32 constant TAG_MIKE = keccak256("@mike");

    uint256 constant SECP_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    uint64 expiry;

    function setUp() public {
        signer = vm.addr(signerPk);
        vault = new FabrikaVault(signer);
        vm.deal(sender, 100 ether);
        expiry = uint64(block.timestamp + 7 days);
    }

    // ---------------------------------------------------------------- helpers

    function _create() internal {
        bytes32[] memory ids = new bytes32[](3);
        bytes32[] memory tags = new bytes32[](3);
        uint256[] memory amts = new uint256[](3);
        ids[0] = ID_ADA;   tags[0] = TAG_ADA;   amts[0] = 5 ether;
        ids[1] = ID_TUNDE; tags[1] = TAG_TUNDE; amts[1] = 3 ether;
        ids[2] = ID_MIKE;  tags[2] = TAG_MIKE;  amts[2] = 10 ether;
        vm.prank(sender);
        vault.createBatch{value: 18 ether}(BATCH, ids, tags, amts, expiry);
    }

    function _sign(bytes32 id, bytes32 tag, address dest, uint256 deadline, uint256 pk)
        internal
        view
        returns (bytes memory)
    {
        bytes32 d = vault.claimDigest(id, tag, dest, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, d);
        return abi.encodePacked(r, s, v);
    }

    function _status(bytes32 id) internal view returns (FabrikaVault.Status st) {
        (, , , , , st) = vault.getAllocation(id);
    }

    // ----------------------------------------------------------------- create

    function test_createLocksExactTotal() public {
        _create();
        assertEq(address(vault).balance, 18 ether);
        assertEq(sender.balance, 82 ether);
        assertEq(uint8(_status(ID_ADA)), uint8(FabrikaVault.Status.Open));
    }

    function test_createRevertsOnWrongTotal() public {
        bytes32[] memory ids = new bytes32[](1);
        bytes32[] memory tags = new bytes32[](1);
        uint256[] memory amts = new uint256[](1);
        ids[0] = ID_ADA; tags[0] = TAG_ADA; amts[0] = 5 ether;
        vm.startPrank(sender);
        vm.expectRevert(bytes("Wrong total"));
        vault.createBatch{value: 4 ether}(BATCH, ids, tags, amts, expiry);
        vm.expectRevert(bytes("Wrong total"));
        vault.createBatch{value: 6 ether}(BATCH, ids, tags, amts, expiry);
        vm.stopPrank();
    }

    function test_createRevertsOnDuplicateAllocationInSameBatch() public {
        bytes32[] memory ids = new bytes32[](2);
        bytes32[] memory tags = new bytes32[](2);
        uint256[] memory amts = new uint256[](2);
        ids[0] = ID_ADA; tags[0] = TAG_ADA; amts[0] = 1 ether;
        ids[1] = ID_ADA; tags[1] = TAG_TUNDE; amts[1] = 1 ether;
        vm.prank(sender);
        vm.expectRevert(bytes("Allocation exists"));
        vault.createBatch{value: 2 ether}(BATCH, ids, tags, amts, expiry);
    }

    function test_createRevertsOnReusedIds() public {
        _create();
        bytes32[] memory ids = new bytes32[](1);
        bytes32[] memory tags = new bytes32[](1);
        uint256[] memory amts = new uint256[](1);
        ids[0] = ID_ADA; tags[0] = TAG_ADA; amts[0] = 1 ether;

        vm.prank(sender);
        vm.expectRevert(bytes("Batch exists"));
        vault.createBatch{value: 1 ether}(BATCH, ids, tags, amts, expiry);

        vm.prank(sender);
        vm.expectRevert(bytes("Allocation exists"));
        vault.createBatch{value: 1 ether}(keccak256("batch-2"), ids, tags, amts, expiry);
    }

    function test_createRevertsOnBadInputs() public {
        bytes32[] memory ids = new bytes32[](1);
        bytes32[] memory tags = new bytes32[](1);
        uint256[] memory amts = new uint256[](1);
        ids[0] = ID_ADA; tags[0] = TAG_ADA; amts[0] = 0;

        vm.startPrank(sender);
        vm.expectRevert(bytes("Bad amount"));
        vault.createBatch(BATCH, ids, tags, amts, expiry);

        amts[0] = 1 ether;
        vm.expectRevert(bytes("Bad expiry"));
        vault.createBatch{value: 1 ether}(BATCH, ids, tags, amts, uint64(block.timestamp));

        bytes32[] memory noTags = new bytes32[](0);
        vm.expectRevert(bytes("Length mismatch"));
        vault.createBatch{value: 1 ether}(BATCH, ids, noTags, amts, expiry);

        bytes32[] memory none = new bytes32[](0);
        uint256[] memory noAmts = new uint256[](0);
        vm.expectRevert(bytes("Bad count"));
        vault.createBatch(BATCH, none, none, noAmts, expiry);
        vm.stopPrank();
    }

    function test_vaultRejectsPlainTransfers() public {
        vm.deal(address(this), 1 ether);
        (bool ok, ) = address(vault).call{value: 1 ether}("");
        assertFalse(ok);
    }

    // ------------------------------------------------------------------ claim

    function test_claimPaysExactAmountOnce() public {
        _create();
        uint256 dl = block.timestamp + 10 minutes;
        bytes memory sig = _sign(ID_ADA, TAG_ADA, ada, dl, signerPk);

        vault.claim(ID_ADA, ada, dl, sig);

        assertEq(ada.balance, 5 ether);
        assertEq(address(vault).balance, 13 ether);
        assertEq(uint8(_status(ID_ADA)), uint8(FabrikaVault.Status.Claimed));

        // other allocations untouched
        assertEq(uint8(_status(ID_TUNDE)), uint8(FabrikaVault.Status.Open));
    }

    function test_duplicateClaimReverts() public {
        _create();
        uint256 dl = block.timestamp + 10 minutes;
        bytes memory sig = _sign(ID_ADA, TAG_ADA, ada, dl, signerPk);
        vault.claim(ID_ADA, ada, dl, sig);

        vm.expectRevert(bytes("Not open"));
        vault.claim(ID_ADA, ada, dl, sig);
        assertEq(ada.balance, 5 ether);
    }

    function test_signatureFromStrangerRejected() public {
        _create();
        uint256 dl = block.timestamp + 10 minutes;
        bytes memory sig = _sign(ID_ADA, TAG_ADA, mallory, dl, strangerPk);
        vm.expectRevert(bytes("Bad authorization"));
        vault.claim(ID_ADA, mallory, dl, sig);
    }

    function test_walletSubstitutionRejected() public {
        _create();
        uint256 dl = block.timestamp + 10 minutes;
        bytes memory sigForAda = _sign(ID_ADA, TAG_ADA, ada, dl, signerPk);
        vm.prank(mallory);
        vm.expectRevert(bytes("Bad authorization"));
        vault.claim(ID_ADA, mallory, dl, sigForAda);
        assertEq(mallory.balance, 0);
    }

    function test_signatureForOtherAllocationRejected() public {
        _create();
        uint256 dl = block.timestamp + 10 minutes;
        bytes memory sigForTunde = _sign(ID_TUNDE, TAG_TUNDE, ada, dl, signerPk);
        vm.expectRevert(bytes("Bad authorization"));
        vault.claim(ID_ADA, ada, dl, sigForTunde);
    }

    function test_malformedAndMalleableSignaturesRejected() public {
        _create();
        uint256 dl = block.timestamp + 10 minutes;

        vm.expectRevert(bytes("Bad authorization"));
        vault.claim(ID_ADA, ada, dl, bytes("short"));

        bytes32 d = vault.claimDigest(ID_ADA, TAG_ADA, ada, dl);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, d);
        bytes32 highS = bytes32(SECP_N - uint256(s));
        uint8 flippedV = v == 27 ? 28 : 27;
        vm.expectRevert(bytes("Bad authorization"));
        vault.claim(ID_ADA, ada, dl, abi.encodePacked(r, highS, flippedV));
    }

    function test_expiredAuthorizationRejected() public {
        _create();
        uint256 dl = block.timestamp + 10 minutes;
        bytes memory sig = _sign(ID_ADA, TAG_ADA, ada, dl, signerPk);
        vm.warp(block.timestamp + 11 minutes);
        vm.expectRevert(bytes("Authorization expired"));
        vault.claim(ID_ADA, ada, dl, sig);
    }

    function test_claimAfterBatchExpiryRejected() public {
        _create();
        vm.warp(expiry);
        uint256 dl = block.timestamp + 1 hours;
        bytes memory sig = _sign(ID_ADA, TAG_ADA, ada, dl, signerPk);
        vm.expectRevert(bytes("Expired"));
        vault.claim(ID_ADA, ada, dl, sig);
        assertEq(uint8(_status(ID_ADA)), uint8(FabrikaVault.Status.Expired));
    }

    function test_signatureNotValidOnOtherChain() public {
        _create();
        uint256 dl = block.timestamp + 10 minutes;
        bytes memory sig = _sign(ID_ADA, TAG_ADA, ada, dl, signerPk);
        vm.chainId(1);
        vm.expectRevert(bytes("Bad authorization"));
        vault.claim(ID_ADA, ada, dl, sig);
    }

    function test_signatureNotValidOnOtherContract() public {
        _create();
        uint256 dl = block.timestamp + 10 minutes;
        bytes memory sig = _sign(ID_ADA, TAG_ADA, ada, dl, signerPk);

        FabrikaVault other = new FabrikaVault(signer);
        vm.deal(sender, 100 ether);
        bytes32[] memory ids = new bytes32[](1);
        bytes32[] memory tags = new bytes32[](1);
        uint256[] memory amts = new uint256[](1);
        ids[0] = ID_ADA; tags[0] = TAG_ADA; amts[0] = 5 ether;
        vm.prank(sender);
        other.createBatch{value: 5 ether}(BATCH, ids, tags, amts, expiry);

        vm.expectRevert(bytes("Bad authorization"));
        other.claim(ID_ADA, ada, dl, sig);
    }

    function test_badDestinationRejected() public {
        _create();
        uint256 dl = block.timestamp + 10 minutes;
        bytes memory sig = _sign(ID_ADA, TAG_ADA, address(0), dl, signerPk);
        vm.expectRevert(bytes("Bad destination"));
        vault.claim(ID_ADA, address(0), dl, sig);
    }

    function test_unknownAllocationRejected() public {
        uint256 dl = block.timestamp + 10 minutes;
        bytes memory sig = _sign(ID_ADA, TAG_ADA, ada, dl, signerPk);
        vm.expectRevert(bytes("Not open"));
        vault.claim(ID_ADA, ada, dl, sig);
    }

    function test_reentrantDestinationCannotDrain() public {
        _create();
        Reenterer r = new Reenterer(vault);
        uint256 dl = block.timestamp + 10 minutes;
        bytes memory sig = _sign(ID_ADA, TAG_ADA, address(r), dl, signerPk);
        r.arm(ID_ADA, dl, sig);

        vm.expectRevert(bytes("Transfer failed"));
        vault.claim(ID_ADA, address(r), dl, sig);

        assertEq(address(vault).balance, 18 ether);
        assertEq(uint8(_status(ID_ADA)), uint8(FabrikaVault.Status.Open));
    }

    // --------------------------------------------------------- cancel / refund

    function test_senderCanCancelOpenAllocation() public {
        _create();
        vm.prank(sender);
        vault.cancel(ID_MIKE);
        assertEq(sender.balance, 92 ether);
        assertEq(uint8(_status(ID_MIKE)), uint8(FabrikaVault.Status.Cancelled));

        uint256 dl = block.timestamp + 10 minutes;
        bytes memory sig = _sign(ID_MIKE, TAG_MIKE, ada, dl, signerPk);
        vm.expectRevert(bytes("Not open"));
        vault.claim(ID_MIKE, ada, dl, sig);
    }

    function test_onlySenderCanCancel() public {
        _create();
        vm.prank(mallory);
        vm.expectRevert(bytes("Not sender"));
        vault.cancel(ID_ADA);
    }

    function test_cannotCancelClaimed() public {
        _create();
        uint256 dl = block.timestamp + 10 minutes;
        vault.claim(ID_ADA, ada, dl, _sign(ID_ADA, TAG_ADA, ada, dl, signerPk));
        vm.prank(sender);
        vm.expectRevert(bytes("Not open"));
        vault.cancel(ID_ADA);
    }

    function test_refundOnlyAfterExpiryAndOnlyOnce() public {
        _create();
        vm.expectRevert(bytes("Not expired"));
        vault.refund(ID_ADA);

        vm.warp(expiry);
        // anyone can trigger, funds still go to the sender
        vm.prank(mallory);
        vault.refund(ID_ADA);
        assertEq(sender.balance, 87 ether);
        assertEq(mallory.balance, 0);
        assertEq(uint8(_status(ID_ADA)), uint8(FabrikaVault.Status.Refunded));

        vm.expectRevert(bytes("Not open"));
        vault.refund(ID_ADA);
    }

    function test_cannotRefundClaimed() public {
        _create();
        uint256 dl = block.timestamp + 10 minutes;
        vault.claim(ID_ADA, ada, dl, _sign(ID_ADA, TAG_ADA, ada, dl, signerPk));
        vm.warp(expiry);
        vm.expectRevert(bytes("Not open"));
        vault.refund(ID_ADA);
    }

    // ------------------------------------------------------------------ events

    function test_claimEmitsEvent() public {
        _create();
        uint256 dl = block.timestamp + 10 minutes;
        bytes memory sig = _sign(ID_ADA, TAG_ADA, ada, dl, signerPk);
        vm.expectEmit(true, true, false, true);
        emit FabrikaVault.Claimed(ID_ADA, ada, 5 ether);
        vault.claim(ID_ADA, ada, dl, sig);
    }

    receive() external payable {}
}
