// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {
    ConsensusType,
    Request,
    Response,
    ResponseStatus
} from "../SomniaEvidenceAgent.sol";

interface IAgentCallback {
    function handleResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory details
    ) external;
}

contract MockAgentOrchestrator {
    struct StoredRequest {
        uint256 agentId;
        address callbackContract;
        bytes4 callbackSelector;
        bytes payload;
        uint256 value;
    }

    uint256 public requestCount;
    uint256 public requestDeposit = 0.03 ether;
    mapping(uint256 => StoredRequest) public requests;

    event RequestCreated(
        uint256 indexed requestId,
        uint256 indexed agentId,
        uint256 perAgentBudget,
        bytes payload,
        address[] subcommittee
    );
    event RequestFinalized(uint256 indexed requestId, uint8 status);

    function createRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload
    ) external payable returns (uint256 requestId) {
        require(agentId != 0, "Zero agent");
        require(callbackAddress != address(0), "Zero callback");
        requestId = ++requestCount;
        requests[requestId] = StoredRequest(agentId, callbackAddress, callbackSelector, payload, msg.value);
        emit RequestCreated(requestId, agentId, 0.03 ether, payload, new address[](0));
    }

    function getRequestDeposit() external view returns (uint256) {
        return requestDeposit;
    }

    function fulfill(uint256 requestId, string calldata result, uint256 receipt) external {
        StoredRequest storage stored = requests[requestId];
        require(stored.callbackContract != address(0), "Unknown request");

        Response[] memory responses = new Response[](1);
        responses[0] = Response({
            validator: address(0xA11CE),
            result: abi.encode(result),
            status: ResponseStatus.Success,
            receipt: receipt,
            timestamp: block.timestamp,
            executionCost: 0.03 ether
        });

        Request memory details = Request({
            id: requestId,
            requester: address(this),
            callbackAddress: stored.callbackContract,
            callbackSelector: stored.callbackSelector,
            subcommittee: new address[](0),
            responses: responses,
            responseCount: 1,
            failureCount: 0,
            threshold: 1,
            createdAt: block.timestamp,
            deadline: block.timestamp + 5 minutes,
            status: ResponseStatus.Success,
            consensusType: ConsensusType.Majority,
            remainingBudget: 0,
            perAgentBudget: 0.03 ether
        });

        IAgentCallback(stored.callbackContract).handleResponse(
            requestId,
            responses,
            ResponseStatus.Success,
            details
        );
        emit RequestFinalized(requestId, uint8(ResponseStatus.Success));
    }
}
