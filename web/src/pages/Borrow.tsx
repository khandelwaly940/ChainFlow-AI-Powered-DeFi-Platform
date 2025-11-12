import React, { useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Card } from "../components/Card";
import { Input } from "../components/Input";
import { CORE_ADDRESS, LENDING_CORE_ABI, SCORE_ADDRESS, SCORE_REGISTRY_ABI, WMATIC_ADDRESS, ERC20_ABI, isValidAddress } from "../lib/contracts";
import { parseUnits, formatUnits, maxUint256 } from "viem";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export function Borrow() {
  const { address, isConnected } = useAccount();
  const [collateralAmount, setCollateralAmount] = useState("");
  const [debtAmount, setDebtAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [scoreData, setScoreData] = useState<any>(null);
  const [scoreCommitted, setScoreCommitted] = useState(false);
  const [ltvPercentage, setLtvPercentage] = useState<number | null>(null);

  // Check if score is committed by checking if score hash exists
  const { data: scoreDataOnChain, refetch: refetchScore } = useReadContract({
    address: SCORE_ADDRESS,
    abi: SCORE_REGISTRY_ABI,
    functionName: "getScore",
    args: address ? [address] : undefined,
    query: { 
      enabled: !!address && !!SCORE_ADDRESS,
    },
  });

  useEffect(() => {
    // Check if score hash exists (non-zero) to determine if score is committed
    if (scoreDataOnChain) {
      // scoreDataOnChain is a tuple: [bytes32 scoreHash, uint8 tier]
      let scoreHash: string;
      if (Array.isArray(scoreDataOnChain)) {
        scoreHash = scoreDataOnChain[0] as string;
      } else if (typeof scoreDataOnChain === 'object' && 'scoreHash' in scoreDataOnChain) {
        scoreHash = (scoreDataOnChain as any).scoreHash;
      } else {
        scoreHash = '';
      }
      
      // Check if hash is not all zeros (0x0000...)
      if (scoreHash && 
          scoreHash !== "0x0000000000000000000000000000000000000000000000000000000000000000" &&
          scoreHash !== "0x" &&
          scoreHash.length > 2) {
        setScoreCommitted(true);
      } else {
        setScoreCommitted(false);
      }
    } else {
      setScoreCommitted(false);
    }
  }, [scoreDataOnChain]);

  // Fetch score data
  useEffect(() => {
    if (isConnected && address) {
      fetch(`${API_URL}/score/${address}`)
        .then((res) => res.json())
        .then((data) => setScoreData(data))
        .catch(() => {});
    }
  }, [address, isConnected]);

  // Calculate live LTV
  useEffect(() => {
    if (collateralAmount && debtAmount && scoreData) {
      const collateral = parseFloat(collateralAmount);
      const debt = parseFloat(debtAmount);
      if (collateral > 0 && debt > 0) {
        // Simplified: assuming 1 WMATIC = 1 USD for LTV calculation
        // In production, would use oracle price
        const ltv = (debt / collateral) * 100;
        setLtvPercentage(ltv);
      } else {
        setLtvPercentage(null);
      }
    } else {
      setLtvPercentage(null);
    }
  }, [collateralAmount, debtAmount, scoreData]);

  // Separate hooks for approval and loan transactions
  const { writeContract, data: hash, isPending, error: writeError, reset: resetWriteContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, isError: txError } = useWaitForTransactionReceipt({
    hash,
  });

  // Track which transaction is currently active
  const [currentTxHash, setCurrentTxHash] = useState<`0x${string}` | null>(null);

  const handleCommitScore = async () => {
    if (!address || !scoreData) return;
    setCommitting(true);
    setError(null);
    setSuccess(null);
    try {
      const commitResponse = await fetch(`${API_URL}/score/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          score: scoreData.score,
          tier: scoreData.tier,
        }),
      });
      if (!commitResponse.ok) {
        const errorData = await commitResponse.json().catch(() => ({}));
        const errorMsg = errorData.error || errorData.message || "Failed to commit score";
        console.error("Commit score error:", errorData);
        throw new Error(errorMsg);
      }
      const result = await commitResponse.json();
      setSuccess("Score committed successfully! Waiting for on-chain confirmation...");
      
      // Optimistically set as committed (will be verified by refetch)
      setScoreCommitted(true);
      
      // Wait a bit for the transaction to be mined, then refetch to verify
      setTimeout(async () => {
        try {
          const refetchResult = await refetchScore();
          // If refetch fails or returns empty, we'll keep the optimistic state
          // The useEffect will update based on actual on-chain data
          if (refetchResult.data) {
            setSuccess("Score committed successfully! You can now open a loan.");
          }
        } catch (err) {
          console.error("Error refetching score:", err);
          // Keep optimistic state even if refetch fails
        }
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setSuccess(null);
    } finally {
      setCommitting(false);
    }
  };

  // Check WMATIC allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: WMATIC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && CORE_ADDRESS ? [address, CORE_ADDRESS] : undefined,
    query: { 
      enabled: !!address && !!CORE_ADDRESS && !!WMATIC_ADDRESS,
      refetchInterval: 2000, // Refetch every 2 seconds to catch approval updates
    },
  });

  const handleApprove = async () => {
    if (!address || !WMATIC_ADDRESS || !CORE_ADDRESS) {
      setError("Missing required addresses. Check your .env.local file.");
      return;
    }
    if (isPending || isConfirming) {
      setError("Another transaction is in progress. Please wait.");
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    setLastTxType("approve");
    console.log("Initiating WMATIC approval...");
    try {
      writeContract({
        address: WMATIC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CORE_ADDRESS, maxUint256], // Approve max for convenience
      });
      console.log("Approval transaction sent, waiting for hash...");
      // Don't set loading to false - wait for transaction confirmation
    } catch (err: any) {
      console.error("Approval error:", err);
      setError(err?.message || "Failed to approve WMATIC");
      setLoading(false);
      setLastTxType(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected || !address) {
      setError("Please connect your wallet");
      return;
    }

    if (!scoreCommitted) {
      setError("Please commit your score first");
      return;
    }

    if (!collateralAmount || !debtAmount) {
      setError("Please enter both collateral and debt amounts");
      return;
    }

    if (!CORE_ADDRESS || !WMATIC_ADDRESS) {
      setError("Contract addresses not configured. Please check your .env.local file and restart the dev server.");
      console.error("Missing addresses:", { CORE_ADDRESS, WMATIC_ADDRESS });
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    // Check if another transaction is in progress
    if (isPending || isConfirming) {
      setError("Another transaction is in progress. Please wait.");
      setLoading(false);
      return;
    }

    try {
      const collateralWei = parseUnits(collateralAmount, 18); // WMATIC has 18 decimals
      const debtWei = parseUnits(debtAmount, 6); // USDC has 6 decimals

      // Refetch allowance to get latest value
      console.log("Refetching allowance before loan...");
      const allowanceResult = await refetchAllowance();
      const currentAllowance = allowanceResult.data ? BigInt(allowanceResult.data.toString()) : 0n;
      
      console.log("Checking allowance:", {
        currentAllowance: currentAllowance.toString(),
        collateralWei: collateralWei.toString(),
        needsApproval: currentAllowance < collateralWei,
        allowanceFormatted: formatUnits(currentAllowance, 18),
        collateralFormatted: collateralAmount
      });

      // Check if approval is needed (with proper BigInt comparison)
      if (!currentAllowance || currentAllowance < collateralWei) {
        setError(`Please approve WMATIC spending first. Current allowance: ${formatUnits(currentAllowance, 18)} WMATIC, needed: ${collateralAmount} WMATIC`);
        setLoading(false);
        return;
      }

      // Open loan on-chain
      setLastTxType("loan");
      console.log("Opening loan with:", {
        collateralWei: collateralWei.toString(),
        debtWei: debtWei.toString(),
        coreAddress: CORE_ADDRESS,
        allowance: currentAllowance.toString(),
        borrower: address
      });
      
      writeContract({
        address: CORE_ADDRESS,
        abi: LENDING_CORE_ABI,
        functionName: "openLoan",
        args: [collateralWei, debtWei],
      });
      console.log("Loan transaction initiated, waiting for hash...");
      // Don't set loading to false here - wait for transaction confirmation via useEffect
    } catch (err: any) {
      console.error("Error opening loan:", err);
      let errorMessage = "Failed to open loan";
      if (err?.message) {
        if (err.message.includes("user rejected") || err.message.includes("User rejected")) {
          errorMessage = "Transaction rejected by user";
        } else if (err.message.includes("insufficient funds")) {
          errorMessage = "Insufficient funds for gas or collateral";
        } else if (err.message.includes("allowance") || err.message.includes("ERC20InsufficientAllowance")) {
          errorMessage = "Please approve WMATIC spending first";
        } else if (err.message.includes("LTV")) {
          errorMessage = "Loan-to-value ratio exceeds your tier limit";
        } else {
          errorMessage = err.message.length > 100 ? "Transaction failed. Check console for details." : err.message;
        }
      }
      setError(errorMessage);
      setLoading(false);
    }
  };

  // Track last transaction type and hash
  const [lastTxType, setLastTxType] = useState<"approve" | "loan" | null>(null);
  const [lastTxHash, setLastTxHash] = useState<`0x${string}` | null>(null);

  // Track when hash changes to detect new transactions
  useEffect(() => {
    if (hash && hash !== lastTxHash) {
      setCurrentTxHash(hash);
      setLastTxHash(hash);
      console.log("✅ New transaction hash received:", hash, "Type:", lastTxType);
      console.log("Transaction state:", { isPending, isConfirming, isSuccess, txError });
    }
  }, [hash, lastTxHash, lastTxType, isPending, isConfirming, isSuccess, txError]);

  // Handle approval success
  useEffect(() => {
    if (isSuccess && hash && lastTxType === "approve" && hash === currentTxHash) {
      console.log("Approval transaction confirmed:", hash);
      setSuccess("✅ WMATIC approved! Refreshing allowance...");
      setLoading(false);
      // Wait a moment then refetch allowance to update UI
      setTimeout(async () => {
        try {
          const result = await refetchAllowance();
          console.log("Allowance after approval:", result.data);
          setSuccess("✅ WMATIC approved! You can now open the loan.");
          // Reset transaction state for next transaction
          resetWriteContract();
          setLastTxType(null);
          setCurrentTxHash(null);
        } catch (err) {
          console.error("Error refetching allowance:", err);
          setSuccess("✅ WMATIC approved! You can now open the loan.");
          resetWriteContract();
          setLastTxType(null);
          setCurrentTxHash(null);
        }
      }, 2000);
    }
  }, [isSuccess, hash, lastTxType, currentTxHash, refetchAllowance, resetWriteContract]);

  // Handle loan opening success
  useEffect(() => {
    if (isSuccess && hash && lastTxType === "loan" && hash === currentTxHash) {
      console.log("Loan transaction confirmed:", hash);
      setSuccess(`✅ Loan opened successfully! You received ${debtAmount} USDC in your wallet (${address}). Your ${collateralAmount} WMATIC is locked as collateral.`);
      setCollateralAmount("");
      setDebtAmount("");
      setLoading(false);
      // Reset transaction state
      resetWriteContract();
      setLastTxType(null);
      setCurrentTxHash(null);
    }
  }, [isSuccess, hash, lastTxType, currentTxHash, debtAmount, collateralAmount, address, resetWriteContract]);

  // Handle transaction errors
  useEffect(() => {
    if (txError && hash === currentTxHash) {
      console.error("Transaction reverted:", hash);
      setError("Transaction failed. The transaction was sent but reverted. Check console for details.");
      setLoading(false);
      resetWriteContract();
      setLastTxType(null);
      setCurrentTxHash(null);
    }
    if (writeError) {
      console.error("Write error:", writeError);
      const errorMsg = (writeError as any)?.message || "Transaction failed";
      if (errorMsg.includes("rejected") || errorMsg.includes("denied") || errorMsg.includes("User rejected")) {
        setError("Transaction rejected. Please try again.");
      } else if (errorMsg.includes("allowance") || errorMsg.includes("ERC20InsufficientAllowance")) {
        setError("Please approve WMATIC spending first. You may need to approve the token in a separate transaction.");
      } else {
        setError(`Transaction failed: ${errorMsg}`);
      }
      setLoading(false);
      resetWriteContract();
      setLastTxType(null);
      setCurrentTxHash(null);
    }
  }, [txError, writeError, hash, currentTxHash, resetWriteContract]);

  // Reset loading if transaction is not pending and no hash (user might have rejected)
  // Only applies to loan opening and approval, not score committing
  useEffect(() => {
    if (loading && !committing && !isPending && !hash && !isSuccess && !txError && !writeError && lastTxType) {
      // Small delay to allow for async state updates
      const timer = setTimeout(() => {
        if (!isPending && !hash && !committing) {
          console.warn("Transaction timeout - no hash received");
          setLoading(false);
          setError("Transaction was not sent. Please check your wallet and try again.");
          setLastTxType(null);
          setCurrentTxHash(null);
        }
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [loading, committing, isPending, hash, isSuccess, txError, writeError, lastTxType]);

  if (!isConnected) {
    return (
      <div className="max-w-2xl mx-auto mt-12">
        <Card>
          <h2 className="text-2xl font-bold mb-4">Connect Your Wallet</h2>
          <ConnectButton />
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto mt-12">
      <Card>
        <h2 className="text-2xl font-bold mb-6">Open a Loan</h2>

        <form onSubmit={handleSubmit}>
          <Input
            label="WMATIC Collateral Amount"
            type="number"
            step="0.000001"
            value={collateralAmount}
            onChange={(e) => setCollateralAmount(e.target.value)}
            placeholder="0.0"
            required
          />

          <Input
            label="USDC Debt Amount"
            type="number"
            step="0.01"
            value={debtAmount}
            onChange={(e) => setDebtAmount(e.target.value)}
            placeholder="0.0"
            required
          />

          {/* Live LTV Bar */}
          {ltvPercentage !== null && scoreData && (
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-400">Current LTV</span>
                <span className={`font-semibold ${
                  ltvPercentage > (scoreData.tier === "A" ? 70 : scoreData.tier === "B" ? 60 : 50)
                    ? "text-red-400"
                    : "text-green-400"
                }`}>
                  {ltvPercentage.toFixed(2)}%
                </span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    ltvPercentage > (scoreData.tier === "A" ? 70 : scoreData.tier === "B" ? 60 : 50)
                      ? "bg-red-500"
                      : "bg-blue-500"
                  }`}
                  style={{ width: `${Math.min(ltvPercentage, 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Max LTV for Tier {scoreData.tier}: {scoreData.tier === "A" ? "70%" : scoreData.tier === "B" ? "60%" : "50%"}
              </p>
            </div>
          )}

           {/* Commit Score Step */}
           {!scoreCommitted && scoreData && (
             <div className="mb-4 p-4 bg-yellow-900/20 border border-yellow-800 rounded-lg">
               <p className="text-sm text-yellow-300 mb-2">
                 <strong>Step 1:</strong> Commit your score to the on-chain registry
               </p>
               <p className="text-xs text-yellow-400 mb-3">
                 ⓘ You only need to do this once per wallet. After committing, you can open multiple loans without committing again.
               </p>
               <button
                 type="button"
                 onClick={handleCommitScore}
                 disabled={committing}
                 className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
               >
                 {committing ? "Committing..." : "Commit Score"}
               </button>
             </div>
           )}

           {/* WMATIC Approval Step */}
           {scoreCommitted && collateralAmount && WMATIC_ADDRESS && (
             <div className="mb-4">
               {(() => {
                 try {
                   const collateralWei = parseUnits(collateralAmount || "0", 18);
                   const allowanceBigInt = allowance ? BigInt(allowance.toString()) : 0n;
                   const needsApproval = !allowance || allowanceBigInt < collateralWei;
                   
                   if (needsApproval) {
                     return (
                       <div className="p-4 bg-yellow-900/20 border border-yellow-800 rounded-lg">
                         <p className="text-sm text-yellow-300 mb-3">
                           <strong>Step 2:</strong> Approve WMATIC spending
                         </p>
                         <p className="text-xs text-yellow-400 mb-2">
                           Current allowance: {formatUnits(allowanceBigInt, 18)} WMATIC
                           <br />
                           Needed: {collateralAmount} WMATIC
                         </p>
                         <button
                           type="button"
                           onClick={handleApprove}
                           disabled={loading || (isPending && lastTxType === "approve") || (isConfirming && lastTxType === "approve")}
                           className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                         >
                           {loading || (isPending && lastTxType === "approve") || (isConfirming && lastTxType === "approve") ? "Approving..." : "Approve WMATIC"}
                         </button>
                       </div>
                     );
                   } else {
                     return (
                       <div className="p-3 bg-green-900/20 border border-green-800 rounded-lg text-sm text-green-300">
                         <p>✅ WMATIC approved ({formatUnits(allowanceBigInt, 18)} WMATIC). Ready to open loan!</p>
                       </div>
                     );
                   }
                 } catch (err) {
                   return (
                     <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-sm text-red-300">
                       <p>Error checking approval. Please check WMATIC_ADDRESS in .env.local</p>
                     </div>
                   );
                 }
               })()}
             </div>
           )}

          {/* Info about receiving USDC */}
          {scoreCommitted && (
            <div className="mb-4 p-3 bg-blue-900/20 border border-blue-800 rounded-lg text-sm text-blue-300">
              <p>
                <strong>Note:</strong> After opening the loan:
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Your WMATIC will be locked as collateral</li>
                  <li>You'll receive USDC in your wallet (same address)</li>
                  <li>Check your USDC token balance after the transaction</li>
                </ul>
              </p>
            </div>
          )}

          {(error || success) && (
            <div className="mb-4">
              {error && (
                <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-red-400">
                  {error}
                </div>
              )}
              {success && !error && (
                <div className="p-3 bg-green-900/20 border border-green-800 rounded-lg text-green-400">
                  {success}
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || isPending || isConfirming || !scoreCommitted}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            {loading || isPending || isConfirming
              ? "Processing..."
              : scoreCommitted
              ? "Open Loan"
              : "Commit Score First"}
          </button>
        </form>

        <div className="mt-6 p-4 bg-gray-800 rounded-lg text-sm text-gray-400">
          <p className="mb-2">
            <strong>LTV Limits by Tier:</strong>
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>Tier A: 70% LTV, 6% APR</li>
            <li>Tier B: 60% LTV, 9% APR</li>
            <li>Tier C: 50% LTV, 12% APR</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}

