# ChainFlow — AI-Assisted DeFi Lending Platform

**ChainFlow** blends AI credit scoring with on-chain lending to reduce collateral needs while staying transparent and decentralized.

## Problem Statement

- **TradFi scores** are opaque and exclude users without formal history
- **DeFi lending** today is mostly over-collateralized and capital-inefficient
- **ChainFlow** solves this by using AI credit scoring to gate loan terms, reducing collateral requirements from 150-200% to ~110-130%

## Core Features

✅ **AI Credit Score (A/B/C)** from wallet activity; score is hashed and stored on-chain  
✅ **Collateralized loans** for USDC on Polygon testnet using WMATIC as collateral  
✅ **Dynamic terms**: LTV and APR depend on the user's tier (A: 70%/6%, B: 60%/9%, C: 50%/12%)  
✅ **Chainlink price feed** drives health factor and liquidation  
✅ **Wallet UX** with MetaMask/RainbowKit; clean React UI  

## Architecture

### High-Level Components

- **Frontend** (React + wagmi): Connect wallet, fetch/commit score, open/repay loans, view health factor
- **API** (Node/Express): Read wallet features, compute score, return tier; commits score hash to Score Registry
- **Smart Contracts** (Solidity): LendingCore, CollateralVault, CreditScoreRegistry, PriceOracleRouter
- **Oracles**: Chainlink price feed for collateral valuation and liquidation triggers

### Smart Contract Responsibilities

#### CreditScoreRegistry
- `setScoreHash(address, bytes32, uint8 tier)` by whitelisted scorer (API wallet)
- `getTier(address)` for the app to read tier
- Stores hash for integrity without revealing raw score

#### PriceOracleRouter
- Wraps Chainlink aggregator; normalizes to 1e18 price units

#### CollateralVault
- Holds collateral tokens; owner-only withdrawals to borrower at close/repay

#### LendingCore
- `openLoan(collateral, desiredDebt)` → checks user tier → enforces max LTV → transfers debt token to user
- `repay(id, amount)` → reduces debt; releases collateral at zero debt
- `healthFactor(id)` → returns HF using latest price
- `liquidate(id, repayAmount)` → when HF < 1, allows liquidator to repay and seize collateral with bonus

### Tier Parameters

| Tier | LTV | APR |
|------|-----|-----|
| A    | 70% | 6%  |
| B    | 60% | 9%  |
| C    | 50% | 12% |

## Project Structure

```
chainflow/
├── contracts/     # Hardhat Solidity contracts
├── api/          # Express/TypeScript scoring API
├── web/          # React frontend application
└── docs/         # Documentation
```

## Setup Instructions

### Prerequisites

- Node.js 20+ (use `.nvmrc` or install manually)
- MetaMask with Polygon Amoy testnet configured
- Testnet tokens (WMATIC, USDC) on Polygon Amoy
- WalletConnect Project ID (get from [cloud.walletconnect.com](https://cloud.walletconnect.com))

### 1. Install Dependencies

```bash
# Install for all packages
cd contracts && npm install
cd ../api && npm install
cd ../web && npm install
```

### 2. Configure Environment Variables

#### Contracts (`contracts/.env`)
```env
POLYGON_AMOY_RPC_URL=https://rpc-amoy.polygon.technology
DEPLOYER_PRIVATE_KEY=your_private_key_here
WMATIC_ADDRESS=0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889
USDC_ADDRESS=0x41E94Eb019C0762f9Bfcf9FB1f58726b5F5D96C5
CHAINLINK_MATIC_USD=0xd0D5e3DB44DE05E9F294BB0a3bEEaF030DE24Ada
```

#### API (`api/.env`)
```env
PORT=4000
RPC_URL=https://rpc-amoy.polygon.technology
PRIVATE_KEY=your_api_wallet_private_key_here
SCORE_REGISTRY_ADDRESS=0x... # After deployment
```

#### Web (`web/.env.local`)
```env
VITE_API_URL=http://localhost:4000
VITE_CORE_ADDRESS=0x... # After deployment
VITE_SCORE_ADDRESS=0x... # After deployment
VITE_WALLETCONNECT_PROJECT_ID=your_project_id_here
```

### 3. Deploy Contracts

```bash
cd contracts
npm run compile
npm run deploy:amoy
```

**Note:** Save the deployed addresses for API and web configuration.

After deployment, transfer ownership of `CollateralVault` to `LendingCore`:
```bash
# This is done automatically in the deploy script
```

### 4. Fund LendingCore with USDC

The `LendingCore` contract needs USDC tokens to lend. Transfer USDC to the deployed `LendingCore` address.

### 5. Start Services

#### Start API
```bash
cd api
npm run dev
```

#### Start Web App
```bash
cd web
npm run dev
```

The web app will be available at `http://localhost:5173`

## Testing Guide

### 1. Connect Wallet
- Open the web app
- Click "Connect Wallet" and select MetaMask
- Ensure you're on Polygon Amoy testnet
- Verify network pill shows "Polygon Amoy"

### 2. View Credit Score
- Navigate to **Dashboard** tab
- Your credit score and tier will be displayed
- Score is computed deterministically from wallet address
- View score signals (wallet age, transaction count, stablecoin score)

### 3. Commit Score
- Navigate to **Borrow** tab
- If score not committed, you'll see "Commit Score" button
- Click to commit your score hash to on-chain registry
- Wait for transaction confirmation

### 4. Open a Loan
- In **Borrow** tab, enter:
  - **WMATIC Collateral Amount** (e.g., 100)
  - **USDC Debt Amount** (e.g., 50)
- Watch the **live LTV bar** update as you type
- Ensure LTV is within your tier's limit (A: 70%, B: 60%, C: 50%)
- Click "Open Loan"
- Approve WMATIC spending if prompted
- Confirm transaction in MetaMask

### 5. View Position
- Navigate to **Positions** tab
- Enter your **Loan ID** (starts from 0)
- View loan details:
  - Borrower address
  - Tier
  - Collateral amount
  - Debt amount
  - Interest rate
  - Created date
  - Last accrued date
  - Status
- View **Health Factor** (updates from Chainlink price feed)
- Health Factor < 1.0 means loan is liquidatable

### 6. Repay Loan
- In **Positions** tab, enter **Repay Amount** in USDC
- Click "Repay"
- Approve USDC spending if prompted
- Confirm transaction
- When debt reaches zero, collateral is automatically released

### 7. Test Liquidation (Optional)
- If health factor drops below 1.0, anyone can liquidate
- Liquidator repays debt and receives collateral with 5% bonus

## Local Development (Hardhat Network) - FREE DEMO SETUP

**Perfect for presentations!** No testnet tokens needed, everything is free and local.

### Quick Setup (Recommended for Demo)

1. **Start Hardhat Node** (Terminal 1):
   ```bash
   cd contracts
   npm run node
   ```
   Keep this running! Note the account addresses and private keys.

2. **Deploy & Setup** (Terminal 2):
   ```bash
   cd contracts
   npm run setup:demo
   ```
   This automatically:
   - Deploys mock WMATIC and USDC tokens
   - Deploys all contracts
   - Mints 1000 WMATIC to borrower
   - Mints 500 USDC to borrower
   - Funds LendingCore with 10,000 USDC

3. **Configure MetaMask**:
   - Add network: http://127.0.0.1:8545, Chain ID: 31337
   - Import Account #1 (borrower) using private key from Hardhat output

4. **Update Environment Variables**:
   - `api/.env`: Set `RPC_URL=http://127.0.0.1:8545` and `SCORE_REGISTRY_ADDRESS`
   - `web/.env.local`: Set `VITE_CORE_ADDRESS` and `VITE_SCORE_ADDRESS`

5. **Start Services**:
   ```bash
   # Terminal 3: API
   cd api && npm run dev
   
   # Terminal 4: Web
   cd web && npm run dev
   ```

**See `LOCAL-DEMO-SETUP.md` for detailed instructions!**

### What You Get
- ✅ Pre-funded accounts (10,000 ETH each)
- ✅ Mock tokens (WMATIC, USDC) minted automatically
- ✅ All contracts deployed
- ✅ Ready for demo immediately!

## Presentation Script

### Introduction (30 seconds)
"ChainFlow is an AI-assisted DeFi lending platform that reduces collateral requirements by using on-chain credit scoring. Instead of requiring 150-200% collateral like traditional DeFi, users with good credit scores can borrow at 110-130% collateral."

### Live Demo (3-4 minutes)

1. **Connect Wallet** (30s)
   - Show MetaMask connection
   - Point out network pill showing "Polygon Amoy"
   - Explain we're on testnet

2. **View Credit Score** (45s)
   - Navigate to Dashboard
   - Show credit tier badge (A/B/C)
   - Explain score is computed from wallet activity
   - Show score signals (wallet age, transactions, stablecoin holdings)
   - Emphasize privacy: only hash is stored on-chain, not raw score

3. **Commit Score** (30s)
   - Navigate to Borrow tab
   - Show "Commit Score" step if not done
   - Click to commit score hash to blockchain
   - Explain this ensures tier is recorded on-chain

4. **Open Loan** (1 minute)
   - Enter collateral amount (e.g., 100 WMATIC)
   - Enter debt amount (e.g., 50 USDC)
   - **Highlight live LTV bar** showing current LTV vs tier limit
   - Explain tier-based LTV limits (A: 70%, B: 60%, C: 50%)
   - Click "Open Loan"
   - Show transaction in MetaMask
   - Explain collateral is locked in vault

5. **View Position** (45s)
   - Navigate to Positions tab
   - Enter loan ID
   - Show loan details: tier, collateral, debt, interest rate
   - **Highlight Health Factor** from Chainlink oracle
   - Explain HF < 1.0 triggers liquidation
   - Show created date and last accrued date

6. **Repay Loan** (30s)
   - Enter repay amount
   - Click "Repay"
   - Show transaction
   - Explain collateral is released when debt reaches zero

### Key Points to Emphasize

- **Transparency**: All scores and terms are on-chain
- **Privacy**: Only score hash stored, not raw score
- **Oracle Integration**: Chainlink ensures accurate pricing
- **Security**: OpenZeppelin contracts, reentrancy guards, safe ERC20
- **Capital Efficiency**: Lower collateral requirements for good borrowers

### Technical Highlights (1 minute)

- **Smart Contracts**: 4 core contracts using OpenZeppelin
- **Oracle**: Chainlink price feeds for real-time valuation
- **Scoring**: Deterministic MVP (can swap in ML model later)
- **Frontend**: React + wagmi + RainbowKit for seamless UX
- **API**: Express server for scoring computation

## Security Features

- ✅ **Ownable** roles for access control
- ✅ **ReentrancyGuard** on all state-changing functions
- ✅ **SafeERC20** for token transfers
- ✅ **Oracle read-only** (no external calls in critical paths)
- ✅ **Chainlink feeds** for price integrity

## Limitations & Future Work

### Current Limitations
- Simple interest calculation (for demo clarity)
- Single collateral/debt pair (WMATIC/USDC)
- Deterministic scoring (MVP version)
- Not audited (demo contracts)

### Future Enhancements
- Multi-asset support
- Real ML scoring model
- Subgraph analytics
- Admin parameter adjustment UI
- Formal security audit

## Troubleshooting

### "Insufficient funds for gas"
- Ensure deployer account has MATIC for gas
- For testnet, use [Polygon Faucet](https://faucet.polygon.technology/)

### "Score changes on refresh"
- This is fixed! Score is now deterministic based on wallet address

### "Failed to commit score"
- Ensure API wallet has MATIC for gas
- Check `SCORE_REGISTRY_ADDRESS` is correct in API `.env`

### "Contract not found"
- Verify contract addresses in `web/.env.local`
- Ensure contracts are deployed to the correct network

### "Network mismatch"
- Ensure MetaMask is on Polygon Amoy (Chain ID: 80002)
- For local: use Hardhat network (Chain ID: 31337)

## License

MIT

## Contact

For questions or issues, please open an issue on the repository.
