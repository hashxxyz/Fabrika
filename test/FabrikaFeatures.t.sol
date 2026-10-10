// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {FabrikaSplit} from "../contracts/FabrikaSplit.sol";
import {FabrikaPledge} from "../contracts/FabrikaPledge.sol";
import {FabrikaGift} from "../contracts/FabrikaGift.sol";
import {FabrikaIncomeShare} from "../contracts/FabrikaIncomeShare.sol";
import {FabrikaStream} from "../contracts/FabrikaStream.sol";
import {FabrikaCover} from "../contracts/FabrikaCover.sol";
import {FabrikaSavings} from "../contracts/FabrikaSavings.sol";

/// Tests for the seven feature contracts. Run: forge test -vv
contract FeaturesBase is Test {
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    address judge = makeAddr("judge");
    address dest = makeAddr("dest");

    function setUp() public virtual {
        vm.warp(1_700_000_000);
        vm.deal(alice, 1000 ether);
        vm.deal(bob, 1000 ether);
        vm.deal(carol, 1000 ether);
    }
}

contract SplitTest is FeaturesBase {
    FabrikaSplit s;
    bytes32 constant ID = keccak256("split");

    function setUp() public override {
        super.setUp();
        s = new FabrikaSplit();
        uint256[] memory a = new uint256[](2);
        a[0] = 10 ether;
        a[1] = 10 ether;
        vm.prank(alice);
        s.createSplit(ID, a, uint64(block.timestamp + 1 days), "dinner");
    }

    function test_sharesPayCreatorDirectly() public {
        uint256 before = alice.balance;
        vm.prank(bob);
        s.payShare{value: 10 ether}(ID, 0);
        assertEq(alice.balance, before + 10 ether);
        vm.prank(carol);
        s.payShare{value: 10 ether}(ID, 1);
        (, , , , FabrikaSplit.Status st, ) = s.getSplit(ID);
        assertEq(uint8(st), uint8(FabrikaSplit.Status.Complete));
    }

    function test_slotCannotBePaidTwice() public {
        vm.prank(bob);
        s.payShare{value: 10 ether}(ID, 0);
        vm.prank(carol);
        vm.expectRevert(bytes("Already paid"));
        s.payShare{value: 10 ether}(ID, 0);
    }

    function test_wrongAmountAndExpiryRevert() public {
        vm.prank(bob);
        vm.expectRevert(bytes("Wrong amount"));
        s.payShare{value: 9 ether}(ID, 0);
        vm.warp(block.timestamp + 1 days);
        vm.prank(bob);
        vm.expectRevert(bytes("Expired"));
        s.payShare{value: 10 ether}(ID, 0);
    }

    function test_onlyCreatorCancels() public {
        vm.prank(bob);
        vm.expectRevert(bytes("Not creator"));
        s.cancel(ID);
        vm.prank(alice);
        s.cancel(ID);
        vm.prank(bob);
        vm.expectRevert(bytes("Cancelled"));
        s.payShare{value: 10 ether}(ID, 0);
    }
}

contract PledgeTest is FeaturesBase {
    FabrikaPledge p;
    bytes32 constant ID = keccak256("pool");
    uint64 endsAt;

    function setUp() public override {
        super.setUp();
        p = new FabrikaPledge();
        endsAt = uint64(block.timestamp + 30 days);
        vm.prank(alice);
        p.createPool{value: 10 ether}(ID, judge, dest, uint64(block.timestamp + 1 days), endsAt, "run");
        vm.prank(bob);
        p.join{value: 10 ether}(ID);
        vm.prank(carol);
        p.join{value: 10 ether}(ID);
    }

    function test_winnersSplitForfeitedStakes() public {
        vm.warp(endsAt);
        address[] memory w = new address[](2);
        w[0] = alice;
        w[1] = bob;
        vm.prank(judge);
        p.resolve(ID, w);

        uint256 a0 = alice.balance;
        vm.prank(alice);
        p.withdraw(ID);
        assertEq(alice.balance, a0 + 15 ether); // own 10 plus half of carol's 10

        vm.prank(bob);
        p.withdraw(ID);

        vm.prank(carol);
        vm.expectRevert(bytes("Not a winner"));
        p.withdraw(ID);
        assertEq(address(p).balance, 0);
    }

    function test_onlyJudgeResolvesAndOnlyAfterEnd() public {
        address[] memory w = new address[](0);
        vm.prank(judge);
        vm.expectRevert(bytes("Not ended"));
        p.resolve(ID, w);
        vm.warp(endsAt);
        vm.prank(alice);
        vm.expectRevert(bytes("Not judge"));
        p.resolve(ID, w);
    }

    function test_cannotNameOutsiderOrDuplicateWinner() public {
        vm.warp(endsAt);
        address[] memory w = new address[](1);
        w[0] = dest;
        vm.prank(judge);
        vm.expectRevert(bytes("Bad winner"));
        p.resolve(ID, w);
        address[] memory d = new address[](2);
        d[0] = alice;
        d[1] = alice;
        vm.prank(judge);
        vm.expectRevert(bytes("Bad winner"));
        p.resolve(ID, d);
    }

    function test_noJudgeMeansEveryoneIsRefunded() public {
        vm.warp(endsAt + 7 days + 1);
        uint256 c0 = carol.balance;
        vm.prank(carol);
        p.withdraw(ID);
        assertEq(carol.balance, c0 + 10 ether);
    }

    function test_withdrawBlockedWhileWaitingForJudge() public {
        vm.warp(endsAt + 1 days);
        vm.prank(carol);
        vm.expectRevert(bytes("Not settled"));
        p.withdraw(ID);
    }

    function test_nobodyFinishedSendsStakesToBeneficiary() public {
        vm.warp(endsAt);
        address[] memory w = new address[](0);
        vm.prank(judge);
        p.resolve(ID, w);
        p.sweep(ID);
        assertEq(dest.balance, 30 ether);
        vm.expectRevert(bytes("Already swept"));
        p.sweep(ID);
    }

    function test_joinRules() public {
        vm.prank(bob);
        vm.expectRevert(bytes("Already in"));
        p.join{value: 10 ether}(ID);
        address late = makeAddr("late");
        vm.deal(late, 10 ether);
        vm.warp(block.timestamp + 2 days);
        vm.prank(late);
        vm.expectRevert(bytes("Joining closed"));
        p.join{value: 10 ether}(ID);
    }
}

contract GiftTest is FeaturesBase {
    FabrikaGift g;
    bytes32 constant ID = keccak256("gift");

    function setUp() public override {
        super.setUp();
        g = new FabrikaGift();
    }

    function test_namedGiftReleasesAfterDate() public {
        vm.prank(alice);
        g.createGift{value: 5 ether}(ID, bob, address(0), address(0), uint64(block.timestamp + 1 days), 0, false, "grad");
        vm.expectRevert(bytes("Not ready"));
        g.release(ID);
        vm.warp(block.timestamp + 1 days);
        uint256 b0 = bob.balance;
        g.release(ID); // anyone can trigger it
        assertEq(bob.balance, b0 + 5 ether);
        vm.expectRevert(bytes("Not open"));
        g.release(ID);
    }

    function test_approverMustConfirm() public {
        vm.prank(alice);
        g.createGift{value: 5 ether}(ID, bob, address(0), carol, 0, 0, false, "exit");
        vm.expectRevert(bytes("Not ready"));
        g.release(ID);
        vm.prank(bob);
        vm.expectRevert(bytes("Not approver"));
        g.approve(ID);
        vm.prank(carol);
        g.approve(ID);
        g.release(ID);
        assertEq(bob.balance, 1005 ether);
    }

    function test_bearerGiftNeedsTheLinkKey() public {
        (address keyAddr, uint256 keyPk) = makeAddrAndKey("linkkey");
        vm.prank(alice);
        g.createGift{value: 5 ether}(ID, address(0), keyAddr, address(0), uint64(block.timestamp + 1 hours), 0, false, "");
        bytes32 d = g.claimDigest(ID, carol);
        (uint8 v, bytes32 r, bytes32 s_) = vm.sign(keyPk, d);
        bytes memory sig = abi.encodePacked(r, s_, v);

        vm.prank(carol);
        vm.expectRevert(bytes("Not ready"));
        g.claim(ID, sig);

        vm.warp(block.timestamp + 1 hours);
        // A copied signature does not work for a different claimer.
        vm.prank(bob);
        vm.expectRevert(bytes("Bad key"));
        g.claim(ID, sig);

        uint256 c0 = carol.balance;
        vm.prank(carol);
        g.claim(ID, sig);
        assertEq(carol.balance, c0 + 5 ether);
    }

    function test_senderCanTakeBackOnlyIfRevocable() public {
        vm.prank(alice);
        g.createGift{value: 5 ether}(ID, bob, address(0), address(0), uint64(block.timestamp + 1 days), 0, false, "");
        vm.prank(alice);
        vm.expectRevert(bytes("Not revocable"));
        g.cancel(ID);

        bytes32 id2 = keccak256("gift2");
        vm.prank(alice);
        g.createGift{value: 5 ether}(id2, bob, address(0), address(0), uint64(block.timestamp + 1 days), 0, true, "");
        vm.prank(bob);
        vm.expectRevert(bytes("Not sender"));
        g.cancel(id2);
        uint256 a0 = alice.balance;
        vm.prank(alice);
        g.cancel(id2);
        assertEq(alice.balance, a0 + 5 ether);
    }

    function test_unclaimedGiftReturnsAfterExpiry() public {
        vm.prank(alice);
        g.createGift{value: 5 ether}(ID, bob, address(0), carol, 0, uint64(block.timestamp + 10 days), false, "");
        vm.expectRevert(bytes("Not expired"));
        g.refund(ID);
        vm.warp(block.timestamp + 10 days);
        uint256 a0 = alice.balance;
        g.refund(ID);
        assertEq(alice.balance, a0 + 5 ether);
        vm.prank(carol);
        vm.expectRevert(bytes("Not open"));
        g.approve(ID);
    }

    function test_mustPickOneRecipientType() public {
        vm.prank(alice);
        vm.expectRevert(bytes("Pick one recipient type"));
        g.createGift{value: 1 ether}(ID, address(0), address(0), address(0), uint64(block.timestamp + 1 days), 0, false, "");
    }
}

contract IncomeShareTest is FeaturesBase {
    FabrikaIncomeShare d;
    bytes32 constant ID = keccak256("deal");
    address payer = makeAddr("payer");

    function setUp() public override {
        super.setUp();
        d = new FabrikaIncomeShare();
        vm.deal(payer, 1000 ether);
        vm.prank(alice);
        d.createDeal(ID, 10 ether, 1000, 15000, uint64(block.timestamp + 7 days), 365 days, "bootcamp");
    }

    function _fill() internal {
        vm.prank(bob);
        d.fund{value: 6 ether}(ID);
        vm.prank(carol);
        d.fund{value: 4 ether}(ID);
    }

    function test_fullFundingPaysBeneficiary() public {
        uint256 a0 = alice.balance;
        _fill();
        assertEq(alice.balance, a0 + 10 ether);
        (, , , , uint8 st) = d.getDeal(ID);
        assertEq(st, 2);
    }

    function test_incomeIsSplitAndCapped() public {
        _fill();
        uint256 a0 = alice.balance;
        vm.prank(payer);
        d.payIncome{value: 100 ether}(ID);
        assertEq(alice.balance, a0 + 90 ether);
        (, uint256 claimable, ) = d.backerInfo(ID, bob);
        assertEq(claimable, 6 ether); // 60% of the 10 MON share

        // Cap is 1.5x of 10 MON = 15 MON. 10 is paid, so only 5 more can go to backers.
        vm.prank(payer);
        d.payIncome{value: 100 ether}(ID);
        (, , , uint256 repaid, ) = d.getDeal(ID);
        assertEq(repaid, 15 ether);

        vm.prank(payer);
        d.payIncome{value: 100 ether}(ID);
        (, , , repaid, ) = d.getDeal(ID);
        assertEq(repaid, 15 ether);

        uint256 b0 = bob.balance;
        vm.prank(bob);
        d.claimReturns(ID);
        assertEq(bob.balance, b0 + 9 ether); // 60% of 15
        vm.prank(bob);
        vm.expectRevert(bytes("Nothing to claim"));
        d.claimReturns(ID);
    }

    function test_noShareAfterTerm() public {
        _fill();
        vm.warp(block.timestamp + 366 days);
        vm.prank(payer);
        d.payIncome{value: 100 ether}(ID);
        (, , , uint256 repaid, ) = d.getDeal(ID);
        assertEq(repaid, 0);
    }

    function test_unfilledDealRefundsBackers() public {
        vm.prank(bob);
        d.fund{value: 3 ether}(ID);
        vm.expectRevert(bytes("Not refundable"));
        vm.prank(bob);
        d.refundFunding(ID);
        vm.warp(block.timestamp + 7 days);
        uint256 b0 = bob.balance;
        vm.prank(bob);
        d.refundFunding(ID);
        assertEq(bob.balance, b0 + 3 ether);
    }

    function test_cannotOverfundOrFundOwnDeal() public {
        vm.prank(bob);
        vm.expectRevert(bytes("Bad amount"));
        d.fund{value: 11 ether}(ID);
        vm.prank(alice);
        vm.expectRevert(bytes("Beneficiary cannot fund"));
        d.fund{value: 1 ether}(ID);
    }
}

contract StreamTest is FeaturesBase {
    FabrikaStream st;
    bytes32 constant ID = keccak256("stream");
    uint256 constant RATE = 1e15; // per second, 1000 seconds = 1 MON

    function setUp() public override {
        super.setUp();
        st = new FabrikaStream();
        vm.prank(alice);
        st.createStream{value: 1 ether}(ID, bob, RATE, 0, uint64(block.timestamp + 1000), "pay");
    }

    function test_recipientWithdrawsWhatStreamed() public {
        vm.warp(block.timestamp + 500);
        uint256 b0 = bob.balance;
        vm.prank(bob);
        st.withdraw(ID);
        assertEq(bob.balance, b0 + 0.5 ether);
        vm.warp(block.timestamp + 10_000);
        vm.prank(bob);
        st.withdraw(ID);
        assertEq(bob.balance, b0 + 1 ether);
    }

    function test_onlyRecipientWithdraws() public {
        vm.warp(block.timestamp + 500);
        vm.prank(carol);
        vm.expectRevert(bytes("Not recipient"));
        st.withdraw(ID);
    }

    function test_cancelSplitsStreamedAndUnstreamed() public {
        vm.warp(block.timestamp + 250);
        uint256 a0 = alice.balance;
        uint256 b0 = bob.balance;
        vm.prank(alice);
        st.cancel(ID);
        assertEq(bob.balance, b0 + 0.25 ether);
        assertEq(alice.balance, a0 + 0.75 ether);
        vm.prank(alice);
        vm.expectRevert(bytes("Not running"));
        st.cancel(ID);
    }

    function test_depositMustMatchExactly() public {
        vm.prank(alice);
        vm.expectRevert(bytes("Wrong deposit"));
        st.createStream{value: 0.9 ether}(keccak256("x"), bob, RATE, 0, uint64(block.timestamp + 1000), "");
    }
}

contract CoverTest is FeaturesBase {
    FabrikaCover c;
    bytes32 constant ID = keccak256("policy");
    address adj;
    uint256 adjPk;

    function setUp() public override {
        super.setUp();
        (adj, adjPk) = makeAddrAndKey("adjudicator");
        c = new FabrikaCover(adj, 500); // 0.05% of the cover per minute
        vm.prank(carol);
        c.deposit{value: 100 ether}();
    }

    function _buy(bytes32 id, uint256 cover, uint256 mins) internal {
        uint256 premium = c.quote(cover, mins);
        vm.prank(alice);
        c.buy{value: premium}(id, cover, mins);
    }

    function test_premiumScalesWithCoverAndTime() public view {
        assertEq(c.quote(10 ether, 60), 0.3 ether);
        assertEq(c.quote(10 ether, 120), 0.6 ether);
    }

    function test_adjudicatorSignedClaimPays() public {
        _buy(ID, 10 ether, 60);
        assertEq(c.assets(), 100.3 ether);
        uint256 deadline = block.timestamp + 1 days;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(adjPk, c.claimDigest(ID, alice, 4 ether, deadline));
        uint256 a0 = alice.balance;
        c.claim(ID, 4 ether, deadline, abi.encodePacked(r, s, v));
        assertEq(alice.balance, a0 + 4 ether);
        assertEq(c.assets(), 96.3 ether);
        assertEq(c.reserved(), 0);
    }

    function test_forgedOrInflatedClaimFails() public {
        _buy(ID, 10 ether, 60);
        uint256 deadline = block.timestamp + 1 days;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(adjPk, c.claimDigest(ID, alice, 4 ether, deadline));
        vm.expectRevert(bytes("Bad authorization")); // signed for 4, asked for 5
        c.claim(ID, 5 ether, deadline, abi.encodePacked(r, s, v));

        (, uint256 otherPk) = makeAddrAndKey("other");
        (v, r, s) = vm.sign(otherPk, c.claimDigest(ID, alice, 4 ether, deadline));
        vm.expectRevert(bytes("Bad authorization"));
        c.claim(ID, 4 ether, deadline, abi.encodePacked(r, s, v));
    }

    function test_cannotSellMoreCoverThanThePoolHolds() public {
        uint256 premium = c.quote(101 ether, 60);
        vm.prank(alice);
        vm.expectRevert(bytes("Not enough capacity"));
        c.buy{value: premium}(ID, 101 ether, 60);
    }

    function test_reservedFundsCannotLeave() public {
        _buy(ID, 90 ether, 60);
        uint256 shares = c.sharesOf(carol);
        vm.prank(carol);
        vm.expectRevert(bytes("Funds reserved for cover"));
        c.withdraw(shares);
    }

    function test_releaseFreesReserveAfterWindow() public {
        _buy(ID, 90 ether, 60);
        vm.expectRevert(bytes("Window open"));
        c.release(ID);
        vm.warp(block.timestamp + 60 minutes + 3 days + 1);
        c.release(ID);
        assertEq(c.reserved(), 0);
        uint256 shares = c.sharesOf(carol);
        vm.prank(carol);
        c.withdraw(shares);
    }

    function test_underwriterEarnsPremiums() public {
        _buy(ID, 10 ether, 60);
        (uint256 value, ) = c.positionOf(carol);
        assertEq(value, 100.3 ether);
    }
}

contract SavingsTest is FeaturesBase {
    FabrikaSavings sv;
    bytes32 constant ID = keccak256("save");
    address f1 = makeAddr("friend1");
    address f2 = makeAddr("friend2");

    function setUp() public override {
        super.setUp();
        sv = new FabrikaSavings(500, 2000); // 5% base, 20% when the goal is confirmed
    }

    function _open() internal {
        address[] memory vs = new address[](2);
        vs[0] = f1;
        vs[1] = f2;
        vm.prank(alice);
        sv.open{value: 100 ether}(ID, vs, 2, uint64(block.timestamp + 30 days), "run");
    }

    function test_baseRateWithoutConfirmation() public {
        (bool ok, ) = address(sv).call{value: 50 ether}("");
        assertTrue(ok);
        _open();
        vm.warp(block.timestamp + 365 days);
        uint256 a0 = alice.balance;
        vm.prank(alice);
        sv.withdraw(ID);
        assertEq(alice.balance, a0 + 105 ether);
        assertEq(sv.rewards(), 45 ether);
    }

    function test_confirmedGoalEarnsBoostedRate() public {
        (bool ok, ) = address(sv).call{value: 50 ether}("");
        assertTrue(ok);
        _open();
        vm.prank(f1);
        sv.attest(ID);
        vm.prank(f2);
        sv.attest(ID);
        vm.warp(block.timestamp + 365 days);
        uint256 a0 = alice.balance;
        vm.prank(alice);
        sv.withdraw(ID);
        assertEq(alice.balance, a0 + 120 ether); // 100 plus 20% yield
    }

    function test_yieldIsCappedByRewardsPoolNotPrincipal() public {
        (bool ok, ) = address(sv).call{value: 2 ether}("");
        assertTrue(ok);
        _open();
        vm.warp(block.timestamp + 365 days);
        uint256 a0 = alice.balance;
        vm.prank(alice);
        sv.withdraw(ID);
        assertEq(alice.balance, a0 + 102 ether);
    }

    function test_onlyNamedFriendsCanConfirmAndOnlyOnce() public {
        _open();
        vm.prank(bob);
        vm.expectRevert(bytes("Not a verifier"));
        sv.attest(ID);
        vm.prank(f1);
        sv.attest(ID);
        vm.prank(f1);
        vm.expectRevert(bytes("Already confirmed"));
        sv.attest(ID);
    }

    function test_lateConfirmationDoesNotCount() public {
        _open();
        vm.warp(block.timestamp + 31 days);
        vm.prank(f1);
        vm.expectRevert(bytes("Deadline passed"));
        sv.attest(ID);
    }

    function test_onlyOwnerWithdrawsAndOnlyOnce() public {
        _open();
        vm.prank(bob);
        vm.expectRevert(bytes("Not owner"));
        sv.withdraw(ID);
        vm.prank(alice);
        sv.withdraw(ID);
        vm.prank(alice);
        vm.expectRevert(bytes("Closed"));
        sv.withdraw(ID);
    }
}
