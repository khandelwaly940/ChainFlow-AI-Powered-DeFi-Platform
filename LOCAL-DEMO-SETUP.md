# 🚀 Local Demo Setup Guide (FREE - No Faucets Needed!)

This guide will help you set up a **completely free local demo** using Hardhat's local blockchain. No testnet tokens, no faucets, no spending!

## ✅ What You Get

- **Pre-funded test accounts** (10,000 ETH each)
- **Mock WMATIC tokens** (minted automatically)
- **Mock USDC tokens** (minted automatically)
- **All contracts deployed** locally
- **Everything ready** for your demo!

## 📋 Step-by-Step Setup

### Step 1: Start Hardhat Local Node

Open a terminal and run:

```bash
cd contracts
npm run node
```

**Keep this terminal open!** You'll see output like:
```
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/

Accounts
========
Account #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (10000 ETH)
Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

Account #1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (10000 ETH)
Private Key: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
...
```

**📝 Note the addresses and private keys!** You'll need Account #1 (borrower) for MetaMask.

### Step 2: Deploy Contracts & Setup (New Terminal)

Open a **NEW terminal** (keep the first one running) and run:

```bash
cd contracts
npm run setup:demo
```

This will:
- ✅ Deploy mock WMATIC and USDC tokens
- ✅ Deploy all contracts
- ✅ Mint 1000 WMATIC to borrower account
- ✅ Mint 500 USDC to borrower account
- ✅ Fund LendingCore with 10,000 USDC
- ✅ Set up mock price oracle

**📝 Copy the contract addresses** from the output!

### Step 3: Configure API

Update `api/.env`:

```env
PORT=4000
RPC_URL=http://127.0.0.1:8545
PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
SCORE_REGISTRY_ADDRESS=<from setup output>
```

**Note:** Use Account #2 private key for API wallet (or any account except #0 and #1).

### Step 4: Configure Web App

Update `web/.env.local`:

```env
VITE_API_URL=http://localhost:4000
VITE_CORE_ADDRESS=<from setup output>
VITE_SCORE_ADDRESS=<from setup output>
VITE_WALLETCONNECT_PROJECT_ID=your_project_id
```

### Step 5: Add Hardhat Network to MetaMask

1. Open MetaMask
2. Click network dropdown → "Add Network" → "Add a network manually"
3. Enter:
   - **Network Name:** Hardhat Local
   - **RPC URL:** http://127.0.0.1:8545
   - **Chain ID:** 31337
   - **Currency Symbol:** ETH
4. Click "Save"

### Step 6: Import Borrower Account to MetaMask

1. In MetaMask, click account icon → "Import Account"
2. Paste the **private key** for Account #1 (borrower) from Step 1
3. You'll see 10,000 ETH balance!

**⚠️ Important:** This account will have WMATIC and USDC tokens, but MetaMask might not show them. They're there, just add the token addresses manually if needed.

### Step 7: Start Services

**Terminal 1:** Hardhat node (already running)

**Terminal 2:** Start API
```bash
cd api
npm run dev
```

**Terminal 3:** Start Web App
```bash
cd web
npm run dev
```

### Step 8: Test Your Demo!

1. Open http://localhost:5173
2. Connect MetaMask (select Hardhat Local network)
3. You should see:
   - ✅ Network pill shows "Local"
   - ✅ Account has ETH balance
4. Go to Dashboard → View your credit score
5. Go to Borrow → Commit score → Open loan!

## 🎯 Demo Flow

1. **Dashboard** → Shows credit tier and score
2. **Borrow** → Commit score → Enter amounts → Open loan
3. **Positions** → View loan → Repay loan

## 💡 Tips

- **Keep Hardhat node running** during your demo
- **All transactions are instant** (local blockchain)
- **No gas costs** (free ETH)
- **Reset anytime** by restarting Hardhat node

## 🔄 If Something Goes Wrong

1. Stop Hardhat node (Ctrl+C)
2. Restart: `npm run node`
3. Run setup again: `npm run setup:demo`
4. Update addresses in env files

## ✅ You're Ready!

Your demo wallet has:
- ✅ 10,000 ETH (for gas)
- ✅ 1,000 WMATIC (for collateral)
- ✅ 500 USDC (for repayments)

**Everything is FREE and LOCAL!** 🎉

