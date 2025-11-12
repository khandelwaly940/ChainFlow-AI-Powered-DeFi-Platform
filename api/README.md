# ChainFlow API

Scoring API that computes credit scores and commits them on-chain.

## Setup

1. Copy `.env.example` to `.env`
2. Fill in:
   - `POLYGON_AMOY_RPC` - RPC URL for Polygon Amoy
   - `PRIVATE_KEY` - Private key for signing transactions
   - `SCORE_REGISTRY` - Address of deployed CreditScoreRegistry contract
   - `PORT` - Server port (default: 4000)

## Install

```bash
npm install
```

## Run

```bash
npm run dev
```

Server starts on port 4000.

## Endpoints

- `GET /score/:address` - Get credit score and tier for an address
- `POST /score/commit` - Commit score hash to on-chain registry
- `GET /health` - Health check

