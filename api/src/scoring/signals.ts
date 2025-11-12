import { ethers } from "ethers";

export interface Signals {
  walletAge: number; // days since first tx
  recentTxCount: number; // transactions in last 30 days
  stablecoinHoldingScore: number; // 0-100 based on stablecoin balance
}

/**
 * Collect simple placeholder signals for a wallet address
 * Uses deterministic hashing based on address for consistent results
 */
export async function collectSignals(
  address: string,
  provider: ethers.Provider
): Promise<Signals> {
  // Placeholder implementation
  // In production, this would query blockchain data, subgraphs, etc.

  // Create deterministic values based on address hash
  // This ensures the same address always gets the same score
  const addressHash = ethers.keccak256(ethers.toUtf8Bytes(address));
  const hashNum = BigInt(addressHash);

  // Extract deterministic values from hash
  // Wallet age: 30-365 days (based on first 8 bytes)
  const walletAge = Number((hashNum >> BigInt(0)) % BigInt(335)) + 30;

  // Recent tx count: 5-55 txs (based on next 8 bytes)
  const recentTxCount = Number((hashNum >> BigInt(64)) % BigInt(50)) + 5;

  // Stablecoin holding score: 0-100 (based on next 8 bytes)
  const stablecoinHoldingScore = Number((hashNum >> BigInt(128)) % BigInt(101));

  return {
    walletAge,
    recentTxCount,
    stablecoinHoldingScore,
  };
}

