// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Like {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract RescueAdapter {
    address public immutable mandate;
    address public immutable inputToken;
    address public immutable outputToken;
    uint16 public immutable feeBps;

    event RescueSwap(uint256 amountIn, uint256 amountOut);

    constructor(address mandate_, address inputToken_, address outputToken_, uint16 feeBps_) {
        require(mandate_ != address(0), "Zero mandate");
        require(inputToken_ != address(0) && outputToken_ != address(0), "Zero token");
        require(feeBps_ <= 1_000, "Fee too high");
        mandate = mandate_;
        inputToken = inputToken_;
        outputToken = outputToken_;
        feeBps = feeBps_;
    }

    function quote(uint256 amountIn) public view returns (uint256) {
        return amountIn * (10_000 - feeBps) / 10_000;
    }

    function execute(uint256 amountIn, uint256 minAmountOut) external returns (uint256 amountOut) {
        require(msg.sender == mandate, "Only mandate");
        amountOut = quote(amountIn);
        require(amountOut >= minAmountOut, "Minimum output not met");
        require(IERC20Like(inputToken).transferFrom(mandate, address(this), amountIn), "Input transfer failed");
        require(IERC20Like(outputToken).transfer(mandate, amountOut), "Output transfer failed");
        emit RescueSwap(amountIn, amountOut);
    }
}

