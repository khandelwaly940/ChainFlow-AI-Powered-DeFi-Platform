# ChainFlow Web

React frontend for ChainFlow lending platform.

## Setup

1. Copy `env.example` to `.env.local`
2. Fill in:
   - `VITE_CORE_ADDRESS` - Address of deployed LendingCore contract
   - `VITE_SCORE_ADDRESS` - Address of deployed CreditScoreRegistry contract
   - `VITE_API_URL` - API server URL (default: http://localhost:4000)
3. Update `src/lib/wagmi.ts` with your WalletConnect Project ID from https://cloud.walletconnect.com

## Install

```bash
npm install
```

## Run

```bash
npm run dev
```

App starts on http://localhost:5173

## Build

```bash
npm run build
```

