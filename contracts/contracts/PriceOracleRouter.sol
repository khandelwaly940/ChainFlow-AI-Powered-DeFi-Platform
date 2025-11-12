// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/**
 * @title PriceOracleRouter
 * @notice Wraps a Chainlink aggregator and returns price scaled to 1e18
 */
contract PriceOracleRouter {
    AggregatorV3Interface public immutable priceFeed;

    constructor(address _priceFeed) {
        priceFeed = AggregatorV3Interface(_priceFeed);
    }

    /**
     * @notice Get the latest price scaled to 1e18
     * @return price The price in 1e18 format
     */
    function getPrice() external view returns (uint256) {
        (, int256 price, , , ) = priceFeed.latestRoundData();
        require(price > 0, "Invalid price");
        
        // Chainlink feeds typically return 8 decimals, scale to 18
        return uint256(price) * 1e10;
    }

    /**
     * @notice Get price with decimals info
     * @return price The price
     * @return decimals The number of decimals (18)
     */
    function getPriceWithDecimals() external view returns (uint256 price, uint8 decimals) {
        (, int256 rawPrice, , , ) = priceFeed.latestRoundData();
        require(rawPrice > 0, "Invalid price");
        
        // Scale from 8 decimals to 18
        price = uint256(rawPrice) * 1e10;
        decimals = 18;
    }
}

