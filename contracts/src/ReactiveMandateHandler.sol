// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SomniaEventHandler} from "@somnia-chain/reactivity-contracts/contracts/SomniaEventHandler.sol";

interface IOpenMandateReactive {
    function startEvaluation(uint256 mandateId) external;
}

contract ReactiveMandateHandler is SomniaEventHandler {
    address public immutable mandate;
    bytes32 public constant MANDATE_CREATED_TOPIC =
        keccak256("MandateCreated(uint256,address,uint256,uint256,uint256,uint16,uint64)");

    constructor(address mandate_) {
        mandate = mandate_;
    }

    function _onEvent(address emitter, bytes32[] calldata topics, bytes calldata) internal override {
        require(emitter == mandate, "Wrong emitter");
        require(topics.length >= 2 && topics[0] == MANDATE_CREATED_TOPIC, "Wrong event");
        IOpenMandateReactive(mandate).startEvaluation(uint256(topics[1]));
    }
}
