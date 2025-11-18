import { ethers } from "ethers";

export interface Signals {
  walletAge: number; // days since first tx
  recentTxCount: number; // transactions in last 30 days
  stablecoinHoldingScore: number; // 0-100 based on stablecoin balance
  loanHistoryScore: number; // 0-100 based on loan repayment history
}

/**
 * Collect real on-chain signals for a wallet address
 * Queries actual blockchain data to calculate creditworthiness
 */
export async function collectSignals(
  address: string,
  provider: ethers.Provider,
  coreAddress?: string,
  usdcAddress?: string
): Promise<Signals> {
  try {
    // 1. Get wallet age (days since first transaction)
    const walletAge = await getWalletAge(address, provider);

    // 2. Get recent transaction count (last 30 days)
    const recentTxCount = await getRecentTxCount(address, provider);

    // 3. Get stablecoin holding score (USDC balance)
    const stablecoinHoldingScore = await getStablecoinScore(address, provider, usdcAddress);

    // 4. Get loan history score (if core address provided)
    const loanHistoryScore = await getLoanHistoryScore(address, provider, coreAddress);

    return {
      walletAge,
      recentTxCount,
      stablecoinHoldingScore,
      loanHistoryScore,
    };
  } catch (error) {
    console.error("Error collecting signals:", error);
    // Fallback to deterministic values if on-chain queries fail
    return getFallbackSignals(address);
  }
}

/**
 * Get wallet age in days (time since first transaction)
 */
async function getWalletAge(address: string, provider: ethers.Provider): Promise<number> {
  try {
    // Get the first transaction (oldest) by querying recent blocks
    // For local networks, we'll use a simpler approach
    const currentBlock = await provider.getBlockNumber();
    
    // Try to find first transaction by checking blocks backwards
    // Limit to last 10000 blocks for performance
    const searchLimit = Math.min(10000, currentBlock);
    let firstTxBlock = currentBlock;
    let found = false;

    // Binary search for first transaction (more efficient)
    let low = 0;
    let high = searchLimit;
    let attempts = 0;
    const maxAttempts = 20; // Limit binary search attempts

    while (low <= high && attempts < maxAttempts) {
      attempts++;
      const mid = Math.floor((low + high) / 2);
      const blockNum = currentBlock - mid;
      
      if (blockNum < 0) break;

      try {
        const block = await provider.getBlock(blockNum, true);
        if (block && block.transactions) {
          // Check if address appears in any transaction
          const hasTx = block.transactions.some((tx: any) => {
            const txObj = typeof tx === 'string' ? null : tx;
            return txObj && (
              txObj.from?.toLowerCase() === address.toLowerCase() ||
              txObj.to?.toLowerCase() === address.toLowerCase()
            );
          });

          if (hasTx) {
            firstTxBlock = blockNum;
            found = true;
            high = mid - 1; // Search earlier
          } else {
            low = mid + 1; // Search later
          }
        }
      } catch (err) {
        // Block might not exist, search later
        low = mid + 1;
      }
    }

    if (found) {
      const firstBlock = await provider.getBlock(firstTxBlock);
      if (firstBlock && firstBlock.timestamp) {
        const now = Math.floor(Date.now() / 1000);
        const daysSince = Math.floor((now - Number(firstBlock.timestamp)) / 86400);
        return Math.max(1, daysSince); // At least 1 day
      }
    }

    // Fallback: assume wallet is at least 30 days old if we can't find first tx
    return 30;
  } catch (error) {
    console.error("Error getting wallet age:", error);
    return 30; // Default fallback
  }
}

/**
 * Get transaction count in last 30 days
 */
async function getRecentTxCount(address: string, provider: ethers.Provider): Promise<number> {
  try {
    const currentBlock = await provider.getBlockNumber();
    const currentBlockData = await provider.getBlock(currentBlock);
    if (!currentBlockData || !currentBlockData.timestamp) {
      return 5; // Fallback
    }

    const thirtyDaysAgo = Number(currentBlockData.timestamp) - (30 * 24 * 60 * 60);
    let txCount = 0;
    let checkedBlocks = 0;
    const maxBlocksToCheck = 10000; // Increased limit to cover more history

    // Check recent blocks for transactions
    for (let i = 0; i < maxBlocksToCheck && currentBlock - i >= 0; i++) {
      try {
        const blockNum = currentBlock - i;
        const block = await provider.getBlock(blockNum, true);
        
        if (!block || !block.timestamp) break;
        
        // Stop if we've gone past 30 days
        if (Number(block.timestamp) < thirtyDaysAgo) {
          console.log(`Stopped at block ${blockNum}, timestamp ${block.timestamp} is before 30 days ago`);
          break;
        }

        if (block.transactions) {
          const relevantTxs = block.transactions.filter((tx: any) => {
            const txObj = typeof tx === 'string' ? null : tx;
            return txObj && (
              txObj.from?.toLowerCase() === address.toLowerCase() ||
              txObj.to?.toLowerCase() === address.toLowerCase()
            );
          });
          txCount += relevantTxs.length;
        }

        checkedBlocks++;
      } catch (err) {
        // Skip block if error
        continue;
      }
    }

    console.log(`Found ${txCount} transactions in last 30 days (checked ${checkedBlocks} blocks)`);
    return Math.max(0, txCount);
  } catch (error) {
    console.error("Error getting recent tx count:", error);
    return 5; // Fallback
  }
}

/**
 * Get stablecoin holding score (0-100) based on USDC balance
 */
async function getStablecoinScore(
  address: string,
  provider: ethers.Provider,
  usdcAddress?: string
): Promise<number> {
  if (!usdcAddress) {
    return 50; // Default if no USDC address
  }

  try {
    // ERC20 balanceOf function
    const erc20Abi = [
      "function balanceOf(address owner) view returns (uint256)",
      "function decimals() view returns (uint8)",
    ];

    const tokenContract = new ethers.Contract(usdcAddress, erc20Abi, provider);
    const balance = await tokenContract.balanceOf(address);
    const decimals = await tokenContract.decimals();

    // Convert to human-readable amount
    const balanceNum = Number(ethers.formatUnits(balance, decimals));

    // Score based on USDC holdings (0-100)
    // 0 USDC = 0 points, 1000+ USDC = 100 points
    const score = Math.min(100, Math.floor(balanceNum / 10)); // 10 USDC = 1 point, max 100
    return score;
  } catch (error) {
    console.error("Error getting stablecoin score:", error);
    return 50; // Default fallback
  }
}

/**
 * Get loan history score based on on-chain loan data
 */
async function getLoanHistoryScore(
  address: string,
  provider: ethers.Provider,
  coreAddress?: string
): Promise<number> {
  if (!coreAddress) {
    return 50; // Default if no core address
  }

  try {
    // LendingCore ABI for loan queries
    const coreAbi = [
      "function loanCounter() view returns (uint256)",
      "function loans(uint256) view returns (address borrower, address collateralToken, address debtToken, uint256 collateralAmount, uint256 debtAmount, uint256 interestRate, uint256 createdAt, uint256 lastAccruedAt, bool active)",
    ];

    const coreContract = new ethers.Contract(coreAddress, coreAbi, provider);
    const loanCounter = await coreContract.loanCounter();

    let activeLoans = 0;
    let repaidLoans = 0;
    let totalLoans = 0;

    // Check up to 100 most recent loans (for performance)
    const maxLoansToCheck = Math.min(100, Number(loanCounter));
    
    for (let i = 0; i < maxLoansToCheck; i++) {
      try {
        const loanId = Number(loanCounter) - 1 - i;
        if (loanId < 0) break;

        const loan = await coreContract.loans(loanId);
        if (loan.borrower.toLowerCase() === address.toLowerCase()) {
          totalLoans++;
          if (loan.active) {
            activeLoans++;
          } else {
            repaidLoans++;
          }
        }
      } catch (err) {
        // Skip if loan doesn't exist
        continue;
      }
    }

    // Score calculation:
    // - Having loans (repaid) = good (shows credit history)
    // - Active loans that are healthy = good
    // - No loans = neutral (50 points)
    let score = 50; // Base score

    if (totalLoans > 0) {
      // Bonus for having loan history (repaid loans are very positive)
      score += Math.min(30, repaidLoans * 10); // +10 per repaid loan, max +30
      
      // Active loans: moderate positive (shows engagement) but too many = risk
      if (activeLoans > 3) {
        score -= (activeLoans - 3) * 5; // -5 per loan over 3 (risk indicator)
      } else if (activeLoans > 0) {
        score += activeLoans * 5; // +5 per active loan (up to 3) - shows engagement
      }
      
      // Additional bonus for having both repaid AND active loans (proven track record)
      if (repaidLoans > 0 && activeLoans > 0 && activeLoans <= 3) {
        score += 5; // Small bonus for good track record
      }
    }

    console.log(`Loan history score for ${address}:`, {
      totalLoans,
      repaidLoans,
      activeLoans,
      calculatedScore: score
    });

    return Math.max(0, Math.min(100, score));
  } catch (error) {
    console.error("Error getting loan history score:", error);
    return 50; // Default fallback
  }
}

/**
 * Fallback to deterministic signals if on-chain queries fail
 */
function getFallbackSignals(address: string): Signals {
  const addressHash = ethers.keccak256(ethers.toUtf8Bytes(address));
  const hashNum = BigInt(addressHash);

  const walletAge = Number((hashNum >> BigInt(0)) % BigInt(335)) + 30;
  const recentTxCount = Number((hashNum >> BigInt(64)) % BigInt(50)) + 5;
  const stablecoinHoldingScore = Number((hashNum >> BigInt(128)) % BigInt(101));
  const loanHistoryScore = 50; // Neutral

  return {
    walletAge,
    recentTxCount,
    stablecoinHoldingScore,
    loanHistoryScore,
  };
}
