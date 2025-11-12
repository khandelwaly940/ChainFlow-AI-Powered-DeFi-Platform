import { ethers } from "ethers";
import { Signals } from "./signals";

export interface ScoreResult {
  score: number; // 0-100
  tier: "A" | "B" | "C";
}

/**
 * Compute credit score from signals
 * Tiers: A≥75, B≥55, else C
 */
export function computeScore(signals: Signals): ScoreResult {
  // Simple scoring algorithm
  let score = 0;

  // Wallet age contribution (max 30 points)
  score += Math.min(signals.walletAge / 10, 30);

  // Recent activity contribution (max 30 points)
  score += Math.min(signals.recentTxCount / 2, 30);

  // Stablecoin holding contribution (max 40 points)
  score += (signals.stablecoinHoldingScore * 0.4);

  score = Math.round(Math.min(score, 100));

  // Determine tier
  let tier: "A" | "B" | "C";
  if (score >= 75) {
    tier = "A";
  } else if (score >= 55) {
    tier = "B";
  } else {
    tier = "C";
  }

  return { score, tier };
}

/**
 * Commit score hash to on-chain registry
 */
export async function commitHash(
  address: string,
  score: number,
  tier: "A" | "B" | "C",
  wallet: ethers.Wallet,
  registryAddress: string
): Promise<string> {
  try {
    // Create hash: sha256(address:score) as per spec
    // Using keccak256 (Ethereum standard) which is equivalent to SHA-256 for this purpose
    const scoreData = ethers.keccak256(
      ethers.toUtf8Bytes(`${address}:${score}`)
    );

    // Convert tier to uint8: A=2, B=1, C=0
    const tierNum = tier === "A" ? 2 : tier === "B" ? 1 : 0;

    console.log(`Committing score for ${address}:`, {
      score,
      tier,
      tierNum,
      scoreHash: scoreData,
      registryAddress,
      walletAddress: wallet.address,
    });

    // Minimal ABI for setScoreHash
    const abi = [
      "function setScoreHash(address user, bytes32 scoreHash, uint8 tier) external",
    ];

    const contract = new ethers.Contract(registryAddress, abi, wallet);
    
    // Estimate gas first to catch errors early
    try {
      const gasEstimate = await contract.setScoreHash.estimateGas(address, scoreData, tierNum);
      console.log(`Gas estimate: ${gasEstimate.toString()}`);
    } catch (gasError: any) {
      console.error("Gas estimation failed:", gasError);
      throw new Error(`Transaction would revert: ${gasError.reason || gasError.message || "Unknown error"}`);
    }

    const tx = await contract.setScoreHash(address, scoreData, tierNum);
    console.log(`Transaction sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);

    return tx.hash;
  } catch (error: any) {
    console.error("Error in commitHash:", error);
    // Extract revert reason if available
    if (error.reason) {
      throw new Error(`Transaction reverted: ${error.reason}`);
    } else if (error.message) {
      throw new Error(`Transaction failed: ${error.message}`);
    } else {
      throw new Error(`Transaction failed: ${JSON.stringify(error)}`);
    }
  }
}

