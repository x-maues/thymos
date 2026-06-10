// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

enum ConsensusType {
    Majority,
    Threshold
}

enum ResponseStatus {
    None,
    Pending,
    Success,
    Failed,
    TimedOut
}

struct Response {
    address validator;
    bytes result;
    ResponseStatus status;
    uint256 receipt;
    uint256 timestamp;
    uint256 executionCost;
}

struct Request {
    uint256 id;
    address requester;
    address callbackAddress;
    bytes4 callbackSelector;
    address[] subcommittee;
    Response[] responses;
    uint256 responseCount;
    uint256 failureCount;
    uint256 threshold;
    uint256 createdAt;
    uint256 deadline;
    ResponseStatus status;
    ConsensusType consensusType;
    uint256 remainingBudget;
    uint256 perAgentBudget;
}

interface IAgentRequester {
    function createRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload
    ) external payable returns (uint256 requestId);

    function getRequestDeposit() external view returns (uint256);
}

interface IJsonApiAgent {
    function fetchString(string memory url, string memory selector) external returns (string memory result);
}

interface IOpenMandateEvidenceSink {
    function submitEvidence(
        uint256 mandateId,
        bytes32 sourceId,
        uint256 priceE6,
        uint64 observedAt,
        bytes32 proof
    ) external returns (bool);
}

/// @notice Evidence agent that requests USDC/USD from Somnia's JSON API agent and submits consensus output to OpenMandate.
contract SomniaEvidenceAgent {
    IAgentRequester public immutable platform;
    IOpenMandateEvidenceSink public immutable mandate;
    uint256 public immutable jsonApiAgentId;

    uint256 public constant SUBCOMMITTEE_SIZE = 3;
    uint256 public constant PER_AGENT_EXECUTION_COST = 0.03 ether;
    bytes32 public constant SOURCE_ID = keccak256("SOMNIA_JSON_API_COINGECKO_USDC_USD");
    string public constant COINGECKO_URL =
        "https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=usd";
    string public constant COINGECKO_SELECTOR = "$.usd-coin.usd";

    mapping(uint256 => uint256) public requestToMandate;

    event AgentRequestCreated(uint256 indexed requestId, uint256 indexed mandateId, uint256 indexed agentId);
    event AgentEvidenceSubmitted(
        uint256 indexed requestId,
        uint256 indexed mandateId,
        uint256 priceE6,
        uint256 receipt,
        bool accepted
    );
    event AgentRequestFailed(uint256 indexed requestId, uint256 indexed mandateId, ResponseStatus status);

    constructor(address platform_, uint256 jsonApiAgentId_, address mandate_) {
        require(platform_ != address(0), "Zero platform");
        require(jsonApiAgentId_ != 0, "Zero agent");
        require(mandate_ != address(0), "Zero mandate");
        platform = IAgentRequester(platform_);
        jsonApiAgentId = jsonApiAgentId_;
        mandate = IOpenMandateEvidenceSink(mandate_);
    }

    function requiredDeposit() public view returns (uint256) {
        return platform.getRequestDeposit() + PER_AGENT_EXECUTION_COST * SUBCOMMITTEE_SIZE;
    }

    function fetchCoinGeckoPrice(uint256 mandateId) external payable returns (uint256 requestId) {
        uint256 deposit = requiredDeposit();
        require(msg.value >= deposit, "Insufficient deposit");

        bytes memory payload = abi.encodeWithSelector(
            IJsonApiAgent.fetchString.selector,
            COINGECKO_URL,
            COINGECKO_SELECTOR
        );

        requestId = platform.createRequest{value: deposit}(
            jsonApiAgentId,
            address(this),
            this.handleResponse.selector,
            payload
        );
        requestToMandate[requestId] = mandateId;
        emit AgentRequestCreated(requestId, mandateId, jsonApiAgentId);
    }

    function handleResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory
    ) external {
        require(msg.sender == address(platform), "Only platform");
        uint256 mandateId = requestToMandate[requestId];
        require(mandateId != 0, "Unknown request");

        if (status != ResponseStatus.Success || responses.length == 0) {
            emit AgentRequestFailed(requestId, mandateId, status);
            return;
        }

        string memory price = abi.decode(responses[0].result, (string));
        uint256 priceE6 = _parseDecimalE6(bytes(price));
        bytes32 proof = keccak256(
            abi.encode(requestId, responses[0].validator, responses[0].receipt, responses[0].result)
        );

        bool accepted = mandate.submitEvidence(
            mandateId,
            SOURCE_ID,
            priceE6,
            uint64(block.timestamp),
            proof
        );
        emit AgentEvidenceSubmitted(requestId, mandateId, priceE6, responses[0].receipt, accepted);
    }

    function _parseDecimalE6(bytes memory raw) private pure returns (uint256 value) {
        uint256 decimals;
        bool afterDecimal;
        bool seenDigit;

        for (uint256 i = 0; i < raw.length; i++) {
            bytes1 char = raw[i];
            if (char >= 0x30 && char <= 0x39) {
                seenDigit = true;
                uint256 digit = uint8(char) - 48;
                if (afterDecimal) {
                    if (decimals < 6) {
                        value = value * 10 + digit;
                        decimals++;
                    }
                } else {
                    value = value * 10 + digit;
                }
            } else if (char == 0x2e && !afterDecimal) {
                afterDecimal = true;
            } else {
                revert("Invalid price");
            }
        }

        require(seenDigit, "Empty price");
        if (!afterDecimal) {
            return value * 1e6;
        }
        while (decimals < 6) {
            value *= 10;
            decimals++;
        }
    }

    receive() external payable {}
}
