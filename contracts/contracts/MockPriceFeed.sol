// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockPriceFeed
 * @notice Mock Chainlink price feed for local testing
 * Implements AggregatorV3Interface
 */
interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    );
}

contract MockPriceFeed is AggregatorV3Interface {
    int256 private price; // Price in 8 decimals (like Chainlink)
    
    constructor() {
        // Default: $0.50 per token (50000000 = 0.5 * 1e8)
        price = 50000000;
    }
    
    function setPrice(uint256 _price) external {
        // Convert from 18 decimals to 8 decimals (Chainlink format)
        price = int256(_price / 1e10);
    }
    
    function latestRoundData() external view returns (
        uint80 roundId,
        int256 answer,
        uint256 startedAt,
        uint256 updatedAt,
        uint80 answeredInRound
    ) {
        return (1, price, block.timestamp, block.timestamp, 1);
    }
    
    function decimals() external pure returns (uint8) {
        return 8;
    }
}

