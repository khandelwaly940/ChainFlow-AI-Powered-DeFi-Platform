import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * Deploy only LendingCore contract (use this if other contracts are already deployed)
 * Update the addresses below with your deployed contract addresses
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying LendingCore with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // UPDATE THESE ADDRESSES with your deployed contracts
  const vaultAddress = "0x7eD375BadF7A97ef76bCDE22ff5CacaF4B300333"; // Your CollateralVault address
  const scoreRegistryAddress = "0x10693C5fC09bFCA7e78F93488A3d9d5F2D12d4f9"; // Your CreditScoreRegistry address
  const oracleAddress = "0x99686C587ffb6C1c4aD17cC98307478096d73cFC"; // Your PriceOracleRouter address

  const collateralToken = process.env.WMATIC;
  const debtToken = process.env.USDC;
  if (!collateralToken || !debtToken) {
    throw new Error("WMATIC or USDC not set in .env");
  }

  // Normalize address checksums
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

