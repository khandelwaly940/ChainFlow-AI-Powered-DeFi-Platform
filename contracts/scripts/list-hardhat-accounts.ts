import { ethers } from "hardhat";

/**
 * List all Hardhat default accounts
 * These are the accounts available when running `npx hardhat node`
 */
async function main() {
  const accounts = await ethers.getSigners();
  
  console.log("Hardhat Default Accounts:\n");
  console.log("=" .repeat(80));
  
  accounts.forEach(async (account, index) => {
    const balance = await ethers.provider.getBalance(account.address);
    console.log(`Account ${index}:`);
    console.log(`  Address: ${account.address}`);
    console.log(`  Balance: ${ethers.formatEther(balance)} ETH`);
    console.log("");
  });
  
  console.log("=" .repeat(80));
  console.log("\nTo use these accounts in MetaMask:");
  console.log("1. Start Hardhat node: npm run node");
  console.log("2. Add network: http://127.0.0.1:8545, Chain ID: 31337");
  console.log("3. Import account using private key (see Hardhat docs for full list)");
  console.log("\n⚠️  These are TEST keys - NEVER use on mainnet!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

