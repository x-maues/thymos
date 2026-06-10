// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MockToken} from "../src/mocks/MockToken.sol";
import {OpenMandate} from "../src/OpenMandate.sol";
import {RescueAdapter} from "../src/RescueAdapter.sol";
import {MockAgentOrchestrator} from "../src/mocks/MockAgentOrchestrator.sol";
import {SomniaEvidenceAgent} from "../src/SomniaEvidenceAgent.sol";

interface Vm {
    function deal(address who, uint256 newBalance) external;
    function prank(address msgSender) external;
    function startPrank(address msgSender) external;
    function stopPrank() external;
    function warp(uint256 newTimestamp) external;
}

contract OpenMandateTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    MockToken private usdc;
    MockToken private dai;
    OpenMandate private mandate;
    RescueAdapter private adapter;
    MockAgentOrchestrator private orchestrator;
    SomniaEvidenceAgent private somniaEvidenceAgent;

    address private user = address(0xA11CE);
    address private evidenceA = address(0xE1);
    address private evidenceB = address(0xE2);
    address private strategyA = address(0x51);
    address private strategyB = address(0x52);

    function setUp() public {
        usdc = new MockToken("Mock USDC", "mUSDC");
        dai = new MockToken("Mock DAI", "mDAI");
        mandate = new OpenMandate(address(usdc), address(dai));
        adapter = new RescueAdapter(address(mandate), address(usdc), address(dai), 20);
        orchestrator = new MockAgentOrchestrator();
        somniaEvidenceAgent = new SomniaEvidenceAgent(address(orchestrator), 13_174_292_974_160_097_713, address(mandate));

        mandate.setAdapter(address(adapter));
        mandate.setReactiveHandler(address(this));
        mandate.setAgentRole(evidenceA, OpenMandate.AgentRole.EVIDENCE);
        mandate.setAgentRole(evidenceB, OpenMandate.AgentRole.EVIDENCE);
        mandate.setAgentRole(address(somniaEvidenceAgent), OpenMandate.AgentRole.EVIDENCE);
        mandate.setAgentRole(strategyA, OpenMandate.AgentRole.STRATEGY);
        mandate.setAgentRole(strategyB, OpenMandate.AgentRole.STRATEGY);

        dai.mint(address(adapter), 1_000_000e6);
        usdc.mint(user, 1_000e6);
        vm.deal(user, 10 ether);
    }

    function testCompleteAutonomousRescue() public {
        uint256 mandateId = _createMandate();
        mandate.startEvaluation(mandateId);

        vm.prank(evidenceA);
        bool first = mandate.submitEvidence(
            mandateId, keccak256("SOURCE_A"), 979_000, uint64(block.timestamp), keccak256("evidence-a")
        );
        assertTrue(first, "first evidence rejected");

        vm.prank(evidenceB);
        bool second = mandate.submitEvidence(
            mandateId, keccak256("SOURCE_B"), 981_000, uint64(block.timestamp), keccak256("evidence-b")
        );
        assertTrue(second, "second evidence rejected");
        assertEq(mandate.confirmingEvidenceCount(mandateId), 2, "missing quorum");

        vm.prank(strategyB);
        bool unsafeProposal = mandate.submitProposal(mandateId, 99_900_000, 75, keccak256("route-b"));
        assertTrue(!unsafeProposal, "unsafe proposal accepted");

        vm.prank(strategyA);
        bool safeProposal = mandate.submitProposal(mandateId, 99_800_000, 20, keccak256("route-a"));
        assertTrue(safeProposal, "safe proposal rejected");

        uint256 winnerBefore = strategyA.balance;
        mandate.finalizeProposal(mandateId);
        mandate.executeMandate(mandateId);

        (,,,,,, OpenMandate.MandateStatus status, address winner, uint256 amountOut) = mandate.mandates(mandateId);
        assertEq(uint256(status), uint256(OpenMandate.MandateStatus.COMPLETED), "not completed");
        assertEq(winner, strategyA, "wrong winner");
        assertEq(amountOut, 99_800_000, "wrong output");
        assertEq(dai.balanceOf(user), 99_800_000, "user did not receive DAI");
        assertEq(strategyA.balance - winnerBefore, 0.05 ether, "bounty not paid");
    }

    function testRejectsDuplicateAndStaleEvidence() public {
        uint256 mandateId = _createMandate();
        mandate.startEvaluation(mandateId);

        bytes32 source = keccak256("SOURCE_A");
        vm.prank(evidenceA);
        assertTrue(
            mandate.submitEvidence(mandateId, source, 979_000, uint64(block.timestamp), bytes32(0)),
            "valid evidence rejected"
        );

        vm.prank(evidenceB);
        assertTrue(
            !mandate.submitEvidence(mandateId, source, 978_000, uint64(block.timestamp), bytes32(0)),
            "duplicate accepted"
        );

        vm.warp(block.timestamp + 16 minutes);
        vm.prank(evidenceB);
        assertTrue(
            !mandate.submitEvidence(
                mandateId, keccak256("SOURCE_B"), 978_000, uint64(block.timestamp - 16 minutes), bytes32(0)
            ),
            "stale evidence accepted"
        );
    }

    function testRequiresEvidenceQuorumForProposal() public {
        uint256 mandateId = _createMandate();
        mandate.startEvaluation(mandateId);
        vm.prank(evidenceA);
        mandate.submitEvidence(
            mandateId, keccak256("SOURCE_A"), 979_000, uint64(block.timestamp), bytes32(0)
        );

        vm.prank(strategyA);
        (bool ok,) = address(mandate).call(
            abi.encodeCall(mandate.submitProposal, (mandateId, 99_800_000, 20, keccak256("route-a")))
        );
        assertTrue(!ok, "proposal accepted without quorum");
    }

    function testSomniaEvidenceAgentSubmitsThroughCallback() public {
        uint256 mandateId = _createMandate();
        mandate.startEvaluation(mandateId);

        somniaEvidenceAgent.fetchCoinGeckoPrice{value: 0.12 ether}(mandateId);
        orchestrator.fulfill(1, "0.979", 42);

        assertEq(mandate.confirmingEvidenceCount(mandateId), 1, "agent evidence missing");
    }

    function testCompletedMandateCannotExecuteTwice() public {
        uint256 mandateId = _completeMandate();
        (bool ok,) = address(mandate).call(abi.encodeCall(mandate.executeMandate, mandateId));
        assertTrue(!ok, "executed twice");
    }

    function testUnregisteredAgentCannotSubmit() public {
        uint256 mandateId = _createMandate();
        mandate.startEvaluation(mandateId);
        vm.prank(address(0xBAD));
        (bool ok,) = address(mandate).call(
            abi.encodeCall(
                mandate.submitEvidence,
                (mandateId, keccak256("SOURCE_X"), 970_000, uint64(block.timestamp), bytes32(0))
            )
        );
        assertTrue(!ok, "unregistered agent accepted");
    }

    function testExpiredMandateCannotProgress() public {
        uint256 mandateId = _createMandate();
        mandate.startEvaluation(mandateId);
        _submitQuorum(mandateId);

        vm.warp(block.timestamp + 2 days);

        vm.prank(strategyA);
        (bool proposalOk,) = address(mandate).call(
            abi.encodeCall(mandate.submitProposal, (mandateId, 99_800_000, 20, keccak256("route-a")))
        );
        assertTrue(!proposalOk, "expired proposal accepted");

        (bool finalizeOk,) = address(mandate).call(abi.encodeCall(mandate.finalizeProposal, mandateId));
        assertTrue(!finalizeOk, "expired mandate finalized");
    }

    function testExpiredOpenMandateRefundsOwner() public {
        uint256 mandateId = _createMandate();
        uint256 userBalanceBefore = user.balance;

        vm.warp(block.timestamp + 2 days);
        vm.prank(user);
        mandate.cancelExpiredMandate(mandateId);

        (,,,,,, OpenMandate.MandateStatus status,,) = mandate.mandates(mandateId);
        assertEq(uint256(status), uint256(OpenMandate.MandateStatus.CANCELLED), "not cancelled");
        assertEq(mandate.deposits(user), 100e6, "deposit not restored");
        assertEq(user.balance - userBalanceBefore, 0.05 ether, "bounty not refunded");
    }

    function testRejectsZeroEvidenceSourceAndDuplicateRoute() public {
        uint256 mandateId = _createMandate();
        mandate.startEvaluation(mandateId);

        vm.prank(evidenceA);
        (bool zeroSourceOk,) = address(mandate).call(
            abi.encodeCall(
                mandate.submitEvidence,
                (mandateId, bytes32(0), 979_000, uint64(block.timestamp), bytes32(0))
            )
        );
        assertTrue(!zeroSourceOk, "zero source accepted");

        _submitQuorum(mandateId);

        bytes32 route = keccak256("route-a");
        vm.prank(strategyA);
        assertTrue(mandate.submitProposal(mandateId, 99_800_000, 20, route), "first route rejected");

        vm.prank(strategyB);
        assertTrue(!mandate.submitProposal(mandateId, 99_700_000, 20, route), "duplicate route accepted");
    }

    function testFinalizeCanOnlySelectOnce() public {
        uint256 mandateId = _createMandate();
        mandate.startEvaluation(mandateId);
        _submitQuorum(mandateId);

        vm.prank(strategyA);
        mandate.submitProposal(mandateId, 99_800_000, 20, keccak256("route-a"));
        mandate.finalizeProposal(mandateId);

        (bool ok,) = address(mandate).call(abi.encodeCall(mandate.finalizeProposal, mandateId));
        assertTrue(!ok, "selected twice");
    }

    function _completeMandate() internal returns (uint256 mandateId) {
        mandateId = _createMandate();
        mandate.startEvaluation(mandateId);
        _submitQuorum(mandateId);
        vm.prank(strategyA);
        mandate.submitProposal(mandateId, 99_800_000, 20, keccak256("route-a"));
        mandate.finalizeProposal(mandateId);
        mandate.executeMandate(mandateId);
    }

    function _submitQuorum(uint256 mandateId) internal {
        vm.prank(evidenceA);
        mandate.submitEvidence(
            mandateId, keccak256("SOURCE_A"), 979_000, uint64(block.timestamp), bytes32(0)
        );
        vm.prank(evidenceB);
        mandate.submitEvidence(
            mandateId, keccak256("SOURCE_B"), 981_000, uint64(block.timestamp), bytes32(0)
        );
    }

    function _createMandate() internal returns (uint256 mandateId) {
        vm.startPrank(user);
        usdc.approve(address(mandate), 100e6);
        mandate.deposit(100e6);
        mandateId = mandate.createMandate{value: 0.05 ether}(
            100e6, 985_000, 50, uint64(block.timestamp + 1 days)
        );
        vm.stopPrank();
    }

    function assertTrue(bool value, string memory message) internal pure {
        require(value, message);
    }

    function assertEq(uint256 a, uint256 b, string memory message) internal pure {
        require(a == b, message);
    }

    function assertEq(address a, address b, string memory message) internal pure {
        require(a == b, message);
    }
}
