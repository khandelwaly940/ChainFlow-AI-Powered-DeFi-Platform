import { ethers } from "hardhat";

/**
 * Complete local setup for demo:
 * 1. Deploy mock ERC20 tokens (WMATIC and USDC)
 * 2. Deploy all contracts
 * 3. Mint tokens to test accounts
 * 4. Fund LendingCore with USDC
 * 5. Print all addresses and instructions
 */
async function main() {
  const [deployer, borrower, apiWallet] = await ethers.getSigners();
  
  console.log("🚀 Setting up LOCAL demo environment...\n");
  console.log("Deployer:", deployer.address);
  console.log("Borrower:", borrower.address);
  console.log("API Wallet:", apiWallet.address);
  console.log("");

  // Step 1: Deploy Mock ERC20 Tokens
  console.log("📦 Step 1: Deploying mock ERC20 tokens...");
  
  // Deploy Mock WMATIC (18 decimals)
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const wmatic = await MockERC20.deploy("Wrapped MATIC", "WMATIC", 18);
  await wmatic.waitForDeployment();
  const wmaticAddress = await wmatic.getAddress();
  console.log("✅ WMATIC deployed to:", wmaticAddress);

  // Deploy Mock USDC (6 decimals)
  const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("✅ USDC deployed to:", usdcAddress);

  // Step 2: Deploy Mock Price Feed
  console.log("\n📊 Step 2: Deploying mock price oracle...");
  const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
  const priceFeed = await MockPriceFeed.deploy();
  await priceFeed.waitForDeployment();
  const priceFeedAddress = await priceFeed.getAddress();
  console.log("✅ Mock Price Feed deployed to:", priceFeedAddress);

  // Step 3: Deploy Core Contracts
  console.log("\n🏗️  Step 3: Deploying core contracts...");
  
  // Deploy PriceOracleRouter
  const PriceOracleRouter = await ethers.getContractFactory("PriceOracleRouter");
  const oracle = await PriceOracleRouter.deploy(priceFeedAddress);
  await oracle.waitForDeployment();
  const oracleAddress = await oracle.getAddress();
  console.log("✅ PriceOracleRouter deployed to:", oracleAddress);

  // Deploy CollateralVault
  const CollateralVault = await ethers.getContractFactory("CollateralVault");
  const vault = await CollateralVault.deploy(deployer.address);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("✅ CollateralVault deployed to:", vaultAddress);

  // Deploy CreditScoreRegistry
  const CreditScoreRegistry = await ethers.getContractFactory("CreditScoreRegistry");
  const scoreRegistry = await CreditScoreRegistry.deploy(apiWallet.address);
  await scoreRegistry.waitForDeployment();
  const scoreRegistryAddress = await scoreRegistry.getAddress();
  console.log("✅ CreditScoreRegistry deployed to:", scoreRegistryAddress);

  // Deploy LendingCore
  const LendingCore = await ethers.getContractFactory("LendingCore");
  const core = await LendingCore.deploy(
    vaultAddress,
    scoreRegistryAddress,
    oracleAddress,
    wmaticAddress,
    usdcAddress,
    deployer.address
  );
  await core.waitForDeployment();
  const coreAddress = await core.getAddress();
  console.log("✅ LendingCore deployed to:", coreAddress);

  // Transfer vault ownership to LendingCore
  await vault.transferOwnership(coreAddress);
  console.log("✅ Vault ownership transferred to LendingCore");

  // Step 4: Mint tokens to test accounts
  console.log("\n💰 Step 4: Minting test tokens...");
  
  // Mint WMATIC to borrower (for collateral)
  const wmaticAmount = ethers.parseUnits("1000", 18); // 1000 WMATIC
  await wmatic.mint(borrower.address, wmaticAmount);
  console.log(`✅ Minted 1000 WMATIC to borrower: ${borrower.address}`);

  // Mint USDC to borrower (for repayments)
  const usdcAmount = ethers.parseUnits("500", 6); // 500 USDC
  await usdc.mint(borrower.address, usdcAmount);
  console.log(`✅ Minted 500 USDC to borrower: ${borrower.address}`);

  // Mint USDC to LendingCore (for lending)
  const lendingAmount = ethers.parseUnits("10000", 6); // 10,000 USDC
  await usdc.mint(coreAddress, lendingAmount);
  console.log(`✅ Minted 10,000 USDC to LendingCore: ${coreAddress}`);

  // Step 5: Set price in mock oracle (1 WMATIC = $0.50)
  console.log("\n💵 Step 5: Setting mock price (1 WMATIC = $0.50)...");
  await priceFeed.setPrice(ethers.parseUnits("0.5", 18)); // $0.50 in 18 decimals
  console.log("✅ Price set to $0.50 per WMATIC");

  // Print summary
  console.log("\n" + "=".repeat(80));
  console.log("✅ LOCAL DEMO SETUP COMPLETE!");
  console.log("=".repeat(80));
  console.log("\n📋 Contract Addresses:");
  console.log("WMATIC Token:", wmaticAddress);
  console.log("USDC Token:", usdcAddress);
  console.log("Price Oracle:", oracleAddress);
  console.log("Collateral Vault:", vaultAddress);
  console.log("Score Registry:", scoreRegistryAddress);
  console.log("Lending Core:", coreAddress);
  
  console.log("\n👤 Test Accounts:");
  console.log("Deployer:", deployer.address);
  console.log("Borrower:", borrower.address, "(Use this in MetaMask!)");
  console.log("API Wallet:", apiWallet.address);
  
  console.log("\n💼 Account Balances:");
  const borrowerWmatic = await wmatic.balanceOf(borrower.address);
  const borrowerUsdc = await usdc.balanceOf(borrower.address);
  const coreUsdc = await usdc.balanceOf(coreAddress);
  console.log(`Borrower WMATIC: ${ethers.formatEther(borrowerWmatic)} WMATIC`);
  console.log(`Borrower USDC: ${ethers.formatUnits(borrowerUsdc, 6)} USDC`);
  console.log(`LendingCore USDC: ${ethers.formatUnits(coreUsdc, 6)} USDC`);

  console.log("\n📝 Next Steps:");
  console.log("1. Update api/.env:");
  console.log(`   RPC_URL=http://127.0.0.1:8545`);
  console.log(`   SCORE_REGISTRY_ADDRESS=${scoreRegistryAddress}`);
  console.log(`   PRIVATE_KEY=<apiWallet private key>`);
  console.log("\n2. Update web/.env.local:");
  console.log(`   VITE_CORE_ADDRESS=${coreAddress}`);
  console.log(`   VITE_SCORE_ADDRESS=${scoreRegistryAddress}`);
  console.log(`   VITE_WMATIC_ADDRESS=${wmaticAddress}`);
  console.log(`   VITE_USDC_ADDRESS=${usdcAddress}`);
  console.log("\n3. Import borrower account to MetaMask:");
  console.log(`   Address: ${borrower.address}`);
  console.log("   (Private key will be shown when you start 'npx hardhat node')");
  console.log("\n4. Add Hardhat network to MetaMask:");
  console.log("   Network Name: Hardhat Local");
  console.log("   RPC URL: http://127.0.0.1:8545");
  console.log("   Chain ID: 31337");
  console.log("   Currency Symbol: ETH");
  console.log("\n🎉 You're ready for the demo!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

