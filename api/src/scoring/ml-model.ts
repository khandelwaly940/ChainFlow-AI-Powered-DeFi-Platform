import { Signals } from "./signals";

/**
 * Simple ML-based credit scoring model
 * Uses weighted features with learned patterns from historical data
 * This is a simplified ML approach - in production, you'd use TensorFlow/PyTorch
 */

interface ModelWeights {
  walletAge: number;
  recentTxCount: number;
  stablecoinHolding: number;
  loanHistory: number;
  interactionScore: number; // Learned from patterns
}

// Learned weights from training (simulated - in production, train on real data)
const MODEL_WEIGHTS: ModelWeights = {
  walletAge: 0.25,           // 25% weight
  recentTxCount: 0.20,       // 20% weight
  stablecoinHolding: 0.25,   // 25% weight
  loanHistory: 0.20,         // 20% weight
  interactionScore: 0.10,    // 10% weight (interaction patterns)
};

/**
 * Calculate interaction score based on feature interactions
 * ML technique: Feature engineering and interaction terms
 */
function calculateInteractionScore(signals: Signals): number {
  // Interaction terms (ML technique: polynomial features)
  // These capture non-linear relationships between features
  
  // Wallet age × Transaction activity (older + active = better)
  const ageActivityInteraction = (signals.walletAge / 365) * (signals.recentTxCount / 50);
  
  // Stablecoin × Loan history (stable holdings + good loans = trustworthy)
  const stabilityInteraction = (signals.stablecoinHoldingScore / 100) * (signals.loanHistoryScore / 100);
  
  // Combined interaction score (0-100)
  const interactionScore = Math.min(100, 
    (ageActivityInteraction * 30) + (stabilityInteraction * 70)
  );
  
  return interactionScore;
}

/**
 * Normalize features to 0-1 range (ML preprocessing)
 */
function normalizeFeatures(signals: Signals): {
  walletAgeNorm: number;
  recentTxNorm: number;
  stablecoinNorm: number;
  loanHistoryNorm: number;
} {
  return {
    // Normalize wallet age (0-365 days -> 0-1)
    walletAgeNorm: Math.min(1, signals.walletAge / 365),
    
    // Normalize transaction count (0-100 txs -> 0-1)
    recentTxNorm: Math.min(1, signals.recentTxCount / 100),
    
    // Stablecoin already 0-100, normalize to 0-1
    stablecoinNorm: signals.stablecoinHoldingScore / 100,
    
    // Loan history already 0-100, normalize to 0-1
    loanHistoryNorm: signals.loanHistoryScore / 100,
  };
}

/**
 * ML-based credit score prediction
 * Uses weighted linear combination with interaction terms
 * This is a simplified ML model - production would use neural networks
 */
export function predictCreditScore(signals: Signals): number {
  // Step 1: Normalize features (ML preprocessing)
  const normalized = normalizeFeatures(signals);
  
  // Step 2: Calculate interaction score (feature engineering)
  const interactionScore = calculateInteractionScore(signals);
  const interactionNorm = interactionScore / 100;
  
  // Step 3: Weighted linear combination (simplified ML model)
  // In production, this would be a neural network or gradient boosting model
  const weightedScore = 
    (normalized.walletAgeNorm * MODEL_WEIGHTS.walletAge * 100) +
    (normalized.recentTxNorm * MODEL_WEIGHTS.recentTxCount * 100) +
    (normalized.stablecoinNorm * MODEL_WEIGHTS.stablecoinHolding * 100) +
    (normalized.loanHistoryNorm * MODEL_WEIGHTS.loanHistory * 100) +
    (interactionNorm * MODEL_WEIGHTS.interactionScore * 100);
  
  // Step 4: Apply activation function (sigmoid-like for 0-100 range)
  // This ensures score stays in valid range and handles edge cases
  const score = Math.min(100, Math.max(0, weightedScore));
  
  return Math.round(score);
}

/**
 * Get feature importance (ML interpretability)
 * Shows which features contribute most to the score
 */
export function getFeatureImportance(signals: Signals): {
  feature: string;
  contribution: number;
  percentage: number;
}[] {
  const normalized = normalizeFeatures(signals);
  const interactionScore = calculateInteractionScore(signals);
  const interactionNorm = interactionScore / 100;
  
  const contributions = [
    {
      feature: "Wallet Age",
      contribution: normalized.walletAgeNorm * MODEL_WEIGHTS.walletAge * 100,
      percentage: MODEL_WEIGHTS.walletAge * 100,
    },
    {
      feature: "Transaction Activity",
      contribution: normalized.recentTxNorm * MODEL_WEIGHTS.recentTxCount * 100,
      percentage: MODEL_WEIGHTS.recentTxCount * 100,
    },
    {
      feature: "Stablecoin Holdings",
      contribution: normalized.stablecoinNorm * MODEL_WEIGHTS.stablecoinHolding * 100,
      percentage: MODEL_WEIGHTS.stablecoinHolding * 100,
    },
    {
      feature: "Loan History",
      contribution: normalized.loanHistoryNorm * MODEL_WEIGHTS.loanHistory * 100,
      percentage: MODEL_WEIGHTS.loanHistory * 100,
    },
    {
      feature: "Feature Interactions",
      contribution: interactionNorm * MODEL_WEIGHTS.interactionScore * 100,
      percentage: MODEL_WEIGHTS.interactionScore * 100,
    },
  ];
  
  return contributions.sort((a, b) => b.contribution - a.contribution);
}

