# ChainFlow Contracts

Smart contracts for collateralized lending on Polygon Amoy.

## Setup

1. Copy `.env.example` to `.env`
2. Fill in:
   - `POLYGON_AMOY_RPC` - RPC URL (e.g., https://rpc-amoy.polygon.technology)
   - `PRIVATE_KEY` - Deployer private key
   - `POLYGONSCAN_KEY` - Polygonscan API key (optional)
   - `WMATIC` - WMATIC token address on Amoy
   - `USDC` - USDC token address on Amoy
   - `CHAINLINK_PRICE_FEED` - Chainlink MATIC/USD price feed on Amoy

## Install

```bash
npm install
```

## Compile

```bash
npm run compile
```

## Test

```bash
npm run test
```

## Deploy

```bash
npm run deploy:amoy
```

After deployment, note the contract addresses and update:
- API `.env` with `SCORE_REGISTRY` address
- Web `.env.local` with `VITE_CORE_ADDRESS` and `VITE_SCORE_ADDRESS`

**Important**: The LendingCore contract must be funded with USDC before loans can be opened. Transfer USDC tokens to the deployed LendingCore address.

## Contracts

- **CollateralVault**: Holds ERC20 collateral securely
- **CreditScoreRegistry**: Stores credit score hash and tier per user
- **PriceOracleRouter**: Wraps Chainlink price feed, returns 1e18 scaled price
- **LendingCore**: Core lending logic with tier-based LTV and APR

