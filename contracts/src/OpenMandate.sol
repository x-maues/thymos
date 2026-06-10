// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Mandate {
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IRescueAdapter {
    function quote(uint256 amountIn) external view returns (uint256 amountOut);
    function execute(uint256 amountIn, uint256 minAmountOut) external returns (uint256 amountOut);
}

contract OpenMandate {
    enum MandateStatus {
        OPEN,
        EVALUATING,
        EXECUTING,
        COMPLETED,
        CANCELLED
    }

    enum AgentRole {
        NONE,
        EVIDENCE,
        STRATEGY
    }

    struct Mandate {
        address owner;
        uint256 amount;
        uint256 bounty;
        uint256 triggerPriceE6;
        uint16 maxSlippageBps;
        uint64 expiresAt;
        MandateStatus status;
        address winner;
        uint256 amountOut;
    }

    struct Evidence {
        address agent;
        bytes32 sourceId;
        uint256 priceE6;
        uint64 observedAt;
        bytes32 proof;
        bool confirmsTrigger;
    }

    struct Proposal {
        address agent;
        uint256 expectedOutput;
        uint16 slippageBps;
        bytes32 routeHash;
        bool valid;
    }

    address public owner;
    address public reactiveHandler;
    address public immutable inputToken;
    address public immutable outputToken;
    address public adapter;
    uint64 public evidenceFreshness = 15 minutes;
    uint256 public mandateCount;

    mapping(address => AgentRole) public agentRoles;
    mapping(address => uint256) public deposits;
    mapping(uint256 => Mandate) public mandates;
    mapping(uint256 => Evidence[]) private _evidence;
    mapping(uint256 => Proposal[]) private _proposals;
    mapping(uint256 => mapping(bytes32 => bool)) public sourceUsed;
    mapping(uint256 => mapping(bytes32 => bool)) public routeUsed;
    mapping(uint256 => uint256) public confirmingEvidenceCount;
    mapping(uint256 => uint256) public selectedProposalIndexPlusOne;

    event AgentRoleSet(address indexed agent, AgentRole role);
    event AdapterSet(address indexed adapter);
    event ReactiveHandlerSet(address indexed handler);
    event Deposited(address indexed user, uint256 amount);
    event MandateCreated(
        uint256 indexed mandateId,
        address indexed owner,
        uint256 amount,
        uint256 bounty,
        uint256 triggerPriceE6,
        uint16 maxSlippageBps,
        uint64 expiresAt
    );
    event EvaluationStarted(uint256 indexed mandateId);
    event EvidenceSubmitted(
        uint256 indexed mandateId,
        address indexed agent,
        bytes32 indexed sourceId,
        uint256 priceE6,
        bytes32 proof,
        bool confirmsTrigger
    );
    event EvidenceRejected(uint256 indexed mandateId, address indexed agent, bytes32 indexed sourceId, string reason);
    event ProposalSubmitted(
        uint256 indexed mandateId,
        address indexed agent,
        uint256 expectedOutput,
        uint16 slippageBps,
        bytes32 routeHash
    );
    event ProposalRejected(uint256 indexed mandateId, address indexed agent, bytes32 indexed routeHash, string reason);
    event ProposalSelected(uint256 indexed mandateId, address indexed agent, bytes32 indexed routeHash);
    event MandateExecuted(uint256 indexed mandateId, uint256 amountIn, uint256 amountOut);
    event BountyPaid(uint256 indexed mandateId, address indexed agent, uint256 bounty);
    event MandateCancelled(uint256 indexed mandateId);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier notExpired(uint256 mandateId) {
        require(block.timestamp <= mandates[mandateId].expiresAt, "Mandate expired");
        _;
    }

    constructor(address inputToken_, address outputToken_) {
        require(inputToken_ != address(0) && outputToken_ != address(0), "Zero token");
        owner = msg.sender;
        inputToken = inputToken_;
        outputToken = outputToken_;
    }

    function setAgentRole(address agent, AgentRole role) external onlyOwner {
        require(agent != address(0), "Zero agent");
        agentRoles[agent] = role;
        emit AgentRoleSet(agent, role);
    }

    function setAdapter(address adapter_) external onlyOwner {
        require(adapter_ != address(0), "Zero adapter");
        adapter = adapter_;
        emit AdapterSet(adapter_);
    }

    function setReactiveHandler(address handler) external onlyOwner {
        require(handler != address(0), "Zero handler");
        reactiveHandler = handler;
        emit ReactiveHandlerSet(handler);
    }

    function setEvidenceFreshness(uint64 freshness) external onlyOwner {
        require(freshness > 0, "Zero freshness");
        evidenceFreshness = freshness;
    }

    function deposit(uint256 amount) external {
        require(amount > 0, "Zero amount");
        require(IERC20Mandate(inputToken).transferFrom(msg.sender, address(this), amount), "Deposit failed");
        deposits[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    function createMandate(
        uint256 amount,
        uint256 triggerPriceE6,
        uint16 maxSlippageBps,
        uint64 expiresAt
    ) external payable returns (uint256 mandateId) {
        require(amount > 0, "Zero amount");
        require(msg.value > 0, "Bounty required");
        require(deposits[msg.sender] >= amount, "Insufficient deposit");
        require(maxSlippageBps <= 2_000, "Slippage too high");
        require(expiresAt > block.timestamp, "Invalid expiry");
        require(adapter != address(0), "Adapter not set");

        deposits[msg.sender] -= amount;
        mandateId = ++mandateCount;
        mandates[mandateId] = Mandate({
            owner: msg.sender,
            amount: amount,
            bounty: msg.value,
            triggerPriceE6: triggerPriceE6,
            maxSlippageBps: maxSlippageBps,
            expiresAt: expiresAt,
            status: MandateStatus.OPEN,
            winner: address(0),
            amountOut: 0
        });

        emit MandateCreated(
            mandateId,
            msg.sender,
            amount,
            msg.value,
            triggerPriceE6,
            maxSlippageBps,
            expiresAt
        );
    }

    function startEvaluation(uint256 mandateId) external notExpired(mandateId) {
        Mandate storage mandate_ = mandates[mandateId];
        require(mandate_.owner != address(0), "Unknown mandate");
        require(mandate_.status == MandateStatus.OPEN, "Not open");
        require(msg.sender == reactiveHandler || msg.sender == owner, "Only reactive handler");
        mandate_.status = MandateStatus.EVALUATING;
        emit EvaluationStarted(mandateId);
    }

    function submitEvidence(
        uint256 mandateId,
        bytes32 sourceId,
        uint256 priceE6,
        uint64 observedAt,
        bytes32 proof
    ) external notExpired(mandateId) returns (bool accepted) {
        require(agentRoles[msg.sender] == AgentRole.EVIDENCE, "Not evidence agent");
        Mandate storage mandate_ = mandates[mandateId];
        require(mandate_.status == MandateStatus.EVALUATING, "Not evaluating");
        require(sourceId != bytes32(0), "Zero source");

        if (sourceUsed[mandateId][sourceId]) {
            emit EvidenceRejected(mandateId, msg.sender, sourceId, "DUPLICATE_SOURCE");
            return false;
        }
        if (observedAt > block.timestamp || block.timestamp - observedAt > evidenceFreshness) {
            emit EvidenceRejected(mandateId, msg.sender, sourceId, "STALE_EVIDENCE");
            return false;
        }

        bool confirmsTrigger = priceE6 < mandate_.triggerPriceE6;
        sourceUsed[mandateId][sourceId] = true;
        _evidence[mandateId].push(Evidence(msg.sender, sourceId, priceE6, observedAt, proof, confirmsTrigger));
        if (confirmsTrigger) confirmingEvidenceCount[mandateId]++;
        emit EvidenceSubmitted(mandateId, msg.sender, sourceId, priceE6, proof, confirmsTrigger);
        return true;
    }

    function submitProposal(
        uint256 mandateId,
        uint256 expectedOutput,
        uint16 slippageBps,
        bytes32 routeHash
    ) external notExpired(mandateId) returns (bool accepted) {
        require(agentRoles[msg.sender] == AgentRole.STRATEGY, "Not strategy agent");
        Mandate storage mandate_ = mandates[mandateId];
        require(mandate_.status == MandateStatus.EVALUATING, "Not evaluating");
        require(confirmingEvidenceCount[mandateId] >= 2, "Evidence quorum missing");
        require(routeHash != bytes32(0), "Zero route");

        if (slippageBps > mandate_.maxSlippageBps) {
            emit ProposalRejected(mandateId, msg.sender, routeHash, "SLIPPAGE_LIMIT");
            return false;
        }
        if (expectedOutput == 0) {
            emit ProposalRejected(mandateId, msg.sender, routeHash, "ZERO_OUTPUT");
            return false;
        }
        if (expectedOutput > IRescueAdapter(adapter).quote(mandate_.amount)) {
            emit ProposalRejected(mandateId, msg.sender, routeHash, "OUTPUT_EXCEEDS_ADAPTER");
            return false;
        }
        if (routeUsed[mandateId][routeHash]) {
            emit ProposalRejected(mandateId, msg.sender, routeHash, "DUPLICATE_ROUTE");
            return false;
        }

        routeUsed[mandateId][routeHash] = true;
        _proposals[mandateId].push(Proposal(msg.sender, expectedOutput, slippageBps, routeHash, true));
        emit ProposalSubmitted(mandateId, msg.sender, expectedOutput, slippageBps, routeHash);
        return true;
    }

    function finalizeProposal(uint256 mandateId) external notExpired(mandateId) {
        Mandate storage mandate_ = mandates[mandateId];
        require(mandate_.status == MandateStatus.EVALUATING, "Not evaluating");
        require(selectedProposalIndexPlusOne[mandateId] == 0, "Already selected");
        Proposal[] storage proposals_ = _proposals[mandateId];
        require(proposals_.length > 0, "No valid proposals");

        uint256 bestIndex;
        for (uint256 i = 1; i < proposals_.length; i++) {
            if (proposals_[i].expectedOutput > proposals_[bestIndex].expectedOutput) bestIndex = i;
        }

        selectedProposalIndexPlusOne[mandateId] = bestIndex + 1;
        mandate_.winner = proposals_[bestIndex].agent;
        emit ProposalSelected(mandateId, proposals_[bestIndex].agent, proposals_[bestIndex].routeHash);
    }

    function executeMandate(uint256 mandateId) external notExpired(mandateId) {
        Mandate storage mandate_ = mandates[mandateId];
        require(mandate_.status == MandateStatus.EVALUATING, "Not executable");
        uint256 selected = selectedProposalIndexPlusOne[mandateId];
        require(selected != 0, "Proposal not selected");

        Proposal storage proposal = _proposals[mandateId][selected - 1];
        mandate_.status = MandateStatus.EXECUTING;

        uint256 minAmountOut = proposal.expectedOutput * (10_000 - proposal.slippageBps) / 10_000;
        require(IERC20Mandate(inputToken).approve(adapter, mandate_.amount), "Approval failed");
        uint256 amountOut = IRescueAdapter(adapter).execute(mandate_.amount, minAmountOut);

        mandate_.amountOut = amountOut;
        mandate_.status = MandateStatus.COMPLETED;
        require(IERC20Mandate(outputToken).transfer(mandate_.owner, amountOut), "Output transfer failed");

        uint256 bounty = mandate_.bounty;
        mandate_.bounty = 0;
        (bool paid,) = payable(mandate_.winner).call{value: bounty}("");
        require(paid, "Bounty payment failed");

        emit MandateExecuted(mandateId, mandate_.amount, amountOut);
        emit BountyPaid(mandateId, mandate_.winner, bounty);
    }

    function cancelExpiredMandate(uint256 mandateId) external {
        Mandate storage mandate_ = mandates[mandateId];
        require(msg.sender == mandate_.owner, "Only mandate owner");
        require(mandate_.status == MandateStatus.OPEN || mandate_.status == MandateStatus.EVALUATING, "Cannot cancel");
        require(block.timestamp > mandate_.expiresAt, "Not expired");

        mandate_.status = MandateStatus.CANCELLED;
        deposits[mandate_.owner] += mandate_.amount;
        uint256 bounty = mandate_.bounty;
        mandate_.bounty = 0;
        (bool refunded,) = payable(mandate_.owner).call{value: bounty}("");
        require(refunded, "Refund failed");
        emit MandateCancelled(mandateId);
    }

    function evidenceCount(uint256 mandateId) external view returns (uint256) {
        return _evidence[mandateId].length;
    }

    function evidenceAt(uint256 mandateId, uint256 index) external view returns (Evidence memory) {
        return _evidence[mandateId][index];
    }

    function proposalCount(uint256 mandateId) external view returns (uint256) {
        return _proposals[mandateId].length;
    }

    function proposalAt(uint256 mandateId, uint256 index) external view returns (Proposal memory) {
        return _proposals[mandateId][index];
    }
}
