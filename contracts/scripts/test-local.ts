import { ethers } from "hardhat";

/**
 * Deploy all contracts to local Hardhat network for testing
 * This doesn't require any MATIC - it's a local blockchain
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying to LOCAL Hardhat network with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // Mock addresses for local testing
  const mockPriceFeed = "0x1111111111111111111111111111111111111111";
  const mockWMATIC = "0x2222222222222222222222222222222222222222";
  const mockUSDC = "0x3333333333333333333333333333333333333333";

  // Deploy PriceOracleRouter
  const PriceOracleRouter = await ethers.getContractFactory("PriceOracleRouter");
  const oracle = await PriceOracleRouter.deploy(mockPriceFeed);
  await oracle.waitForDeployment();
  const oracleAddress = await oracle.getAddress();
  console.log("PriceOracleRouter deployed to:", oracleAddress);

  // Deploy CollateralVault
  const CollateralVault = await ethers.getContractFactory("CollateralVault");
  const vault = await CollateralVault.deploy(deployer.address);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("CollateralVault deployed to:", vaultAddress);

  // Deploy CreditScoreRegistry
  const CreditScoreRegistry = await ethers.getContractFactory("CreditScoreRegistry");
  const scoreRegistry = await CreditScoreRegistry.deploy(deployer.address);
  await scoreRegistry.waitForDeployment();
  const scoreRegistryAddress = await scoreRegistry.getAddress();
  console.log("CreditScoreRegistry deployed to:", scoreRegistryAddress);

  // Deploy LendingCore
  const LendingCore = await ethers.getContractFactory("LendingCore");
  const core = await LendingCore.deploy(
    vaultAddress,
    scoreRegistryAddress,
    oracleAddress,
    mockWMATIC,
    mockUSDC,
    deployer.address
  );
  await core.waitForDeployment();
  const coreAddress = await core.getAddress();
  console.log("LendingCore deployed to:", coreAddress);

  // Transfer vault ownership to LendingCore
  const vaultContract = await ethers.getContractAt("CollateralVault", vaultAddress);
  await vaultContract.transferOwnership(coreAddress);
  console.log("Vault ownership transferred to LendingCore");

  console.log("\n=== LOCAL Deployment Summary ===");
  console.log("Oracle:", oracleAddress);
  console.log("Vault:", vaultAddress);
  console.log("ScoreRegistry:", scoreRegistryAddress);
  console.log("Core:", coreAddress);
  console.log("\n⚠️  These are LOCAL addresses - use for testing only!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

