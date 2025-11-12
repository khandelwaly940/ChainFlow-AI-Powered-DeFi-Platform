import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // Deploy PriceOracleRouter
  const PriceOracleRouter = await ethers.getContractFactory("PriceOracleRouter");
  const priceFeedAddress = process.env.CHAINLINK_PRICE_FEED;
  if (!priceFeedAddress) {
    throw new Error("CHAINLINK_PRICE_FEED not set in .env");
  }
  // Normalize address checksum (convert to lowercase first, then checksum)
  const normalizedPriceFeed = ethers.getAddress(priceFeedAddress.toLowerCase());
  const oracle = await PriceOracleRouter.deploy(normalizedPriceFeed);
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
  const collateralToken = process.env.WMATIC;
  const debtToken = process.env.USDC;
  if (!collateralToken || !debtToken) {
    throw new Error("WMATIC or USDC not set in .env");
  }

  // Normalize address checksums (convert to lowercase first, then checksum)
  const normalizedWMATIC = ethers.getAddress(collateralToken.toLowerCase());
  const normalizedUSDC = ethers.getAddress(debtToken.toLowerCase());

  const LendingCore = await ethers.getContractFactory("LendingCore");
  const core = await LendingCore.deploy(
    vaultAddress,
    scoreRegistryAddress,
    oracleAddress,
    normalizedWMATIC,
    normalizedUSDC,
    deployer.address
  );
  await core.waitForDeployment();
  const coreAddress = await core.getAddress();
  console.log("LendingCore deployed to:", coreAddress);

  // Transfer vault ownership to LendingCore
  const vaultContract = await ethers.getContractAt("CollateralVault", vaultAddress);
  await vaultContract.transferOwnership(coreAddress);
  console.log("Vault ownership transferred to LendingCore");

  console.log("\n=== Deployment Summary ===");
  console.log("Oracle:", oracleAddress);
  console.log("Vault:", vaultAddress);
  console.log("ScoreRegistry:", scoreRegistryAddress);
  console.log("Core:", coreAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

