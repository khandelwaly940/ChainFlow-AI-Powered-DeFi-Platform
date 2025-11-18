import express from "express";
import cors from "cors";
import { ethers } from "ethers";
import { z } from "zod";
import * as dotenv from "dotenv";
import { collectSignals } from "./scoring/signals.js";
import { computeScore, commitHash } from "./scoring/score.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Initialize provider and wallet
const rpcUrl = process.env.RPC_URL || process.env.POLYGON_AMOY_RPC;
const privateKey = process.env.PRIVATE_KEY;
const registryAddress = process.env.SCORE_REGISTRY_ADDRESS || process.env.SCORE_REGISTRY;
const coreAddress = process.env.LENDING_CORE_ADDRESS || process.env.CORE_ADDRESS;
const usdcAddress = process.env.USDC_ADDRESS;

if (!rpcUrl || !privateKey || !registryAddress) {
  console.error("Missing required environment variables");
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(privateKey, provider);

console.log("API wallet address:", wallet.address);
console.log("Score registry:", registryAddress);
console.log("Lending Core:", coreAddress || "Not set (loan history scoring disabled)");
console.log("USDC Address:", usdcAddress || "Not set (stablecoin scoring disabled)");

// Validation schemas
const commitScoreSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
  score: z.number().int().min(0).max(100),
  tier: z.enum(["A", "B", "C"]),
});

// GET /score/:address
app.get("/score/:address", async (req, res) => {
  try {
    const address = req.params.address;
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ error: "Invalid address" });
    }

    // Collect signals with contract addresses for on-chain data
    const signals = await collectSignals(address, provider, coreAddress, usdcAddress);

    // Compute score
    const { score, tier } = computeScore(signals);

    res.json({
      address,
      score,
      tier,
      signals,
      method: "ml", // Indicate AI/ML-based scoring
    });
  } catch (error) {
    console.error("Error getting score:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /score/commit
app.post("/score/commit", async (req, res) => {
  try {
    const body = commitScoreSchema.parse(req.body);
    const { address, score, tier } = body;

    console.log(`Received commit request for ${address}:`, { score, tier });

    // Commit hash to on-chain registry
    const txHash = await commitHash(address, score, tier, wallet, registryAddress);

    res.json({
      success: true,
      address,
      txHash,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error committing score:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({ 
      error: errorMessage,
      details: error instanceof Error ? error.stack : undefined
    });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});

