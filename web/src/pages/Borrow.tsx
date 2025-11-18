import React, { useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, usePublicClient } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Card } from "../components/Card";
import { Input } from "../components/Input";
import { CORE_ADDRESS, LENDING_CORE_ABI, SCORE_ADDRESS, SCORE_REGISTRY_ABI, WMATIC_ADDRESS, USDC_ADDRESS, ERC20_ABI, isValidAddress } from "../lib/contracts";
import { parseUnits, formatUnits, maxUint256 } from "viem";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export function Borrow() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [collateralAmount, setCollateralAmount] = useState("");
  const [debtAmount, setDebtAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [scoreData, setScoreData] = useState<any>(null);
  const [scoreCommitted, setScoreCommitted] = useState(false);
  const [ltvPercentage, setLtvPercentage] = useState<number | null>(null);
  const [shouldPollAllowance, setShouldPollAllowance] = useState(false);
  // Store transaction parameters to prevent using stale values
  const [pendingLoanParams, setPendingLoanParams] = useState<{ collateral: string; debt: string } | null>(null);

  // Check if score is committed by checking if score hash exists
  // Memoize the args to prevent unnecessary re-renders
  const scoreArgs = React.useMemo((): readonly [`0x${string}`] | undefined => {
    return address && SCORE_ADDRESS && isValidAddress(SCORE_ADDRESS) ? [address as `0x${string}`] : undefined;
  }, [address]);

  const { data: scoreDataOnChain, refetch: refetchScore } = useReadContract({
    address: SCORE_ADDRESS,
    abi: SCORE_REGISTRY_ABI,
    functionName: "getScore",
    args: scoreArgs,
    query: { 
      enabled: !!address && !!SCORE_ADDRESS && isValidAddress(SCORE_ADDRESS),
      refetchInterval: false, // Don't poll automatically
      retry: false, // Don't retry on error
      staleTime: Infinity, // Never consider stale (score doesn't change once committed)
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
      await commitResponse.json();
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
      // Only poll when actively waiting for approval transaction
      refetchInterval: shouldPollAllowance ? 2000 : false,
    },
  });

  // Check WMATIC balance to ensure user has enough tokens
  const { data: wmaticBalance, refetch: refetchBalance } = useReadContract({
    address: WMATIC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { 
      enabled: !!address && !!WMATIC_ADDRESS,
      refetchInterval: false,
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
    setShouldPollAllowance(true); // Start polling for allowance updates
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
      setShouldPollAllowance(false); // Stop polling on error
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

    // Validate amounts are positive numbers
    const collateralNum = parseFloat(collateralAmount);
    const debtNum = parseFloat(debtAmount);
    
    if (isNaN(collateralNum) || collateralNum <= 0) {
      setError("Collateral amount must be a positive number");
      return;
    }
    
    if (isNaN(debtNum) || debtNum <= 0) {
      setError("Debt amount must be a positive number");
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

      // First, check if user has enough WMATIC balance
      console.log("Checking WMATIC balance...");
      const balanceResult = await refetchBalance();
      const currentBalance = balanceResult.data ? BigInt(balanceResult.data.toString()) : 0n;
      
      console.log("Balance check:", {
        currentBalance: currentBalance.toString(),
        collateralWei: collateralWei.toString(),
        hasEnoughBalance: currentBalance >= collateralWei,
        balanceFormatted: formatUnits(currentBalance, 18),
        collateralFormatted: collateralAmount
      });

      if (currentBalance < collateralWei) {
        setError(`Insufficient WMATIC balance. You have ${formatUnits(currentBalance, 18)} WMATIC, but need ${collateralAmount} WMATIC for this loan.`);
        setLoading(false);
        return;
      }

      // Then, check if approval is sufficient for this NEW loan amount
      console.log("Refetching allowance before loan...");
      const allowanceResult = await refetchAllowance();
      const currentAllowance = allowanceResult.data ? BigInt(allowanceResult.data.toString()) : 0n;
      
      // Check if allowance is sufficient for the NEW collateral amount
      // Even if they have maxUint256 approved, we still need to verify they have enough balance (done above)
      const maxUint256Value = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
      const isMaxApproval = currentAllowance >= maxUint256Value - BigInt(1000); // Allow for small rounding differences
      
      console.log("Checking allowance:", {
        currentAllowance: currentAllowance.toString(),
        collateralWei: collateralWei.toString(),
        isMaxApproval,
        needsApproval: !isMaxApproval && currentAllowance < collateralWei,
        allowanceFormatted: formatUnits(currentAllowance, 18),
        collateralFormatted: collateralAmount
      });

      // If not max approval, check if allowance is sufficient for this specific loan
      if (!isMaxApproval && (!currentAllowance || currentAllowance < collateralWei)) {
        setError(`Please approve WMATIC spending for this loan. Current allowance: ${formatUnits(currentAllowance, 18)} WMATIC, needed: ${collateralAmount} WMATIC`);
        setLoading(false);
        return;
      }

      // Store transaction parameters BEFORE clearing form to prevent using stale values
      setPendingLoanParams({ collateral: collateralAmount, debt: debtAmount });
      
      // Clear form immediately to prevent user from changing values during transaction
      setCollateralAmount("");
      setDebtAmount("");
      
      // Pre-flight check: Check if contract has enough USDC liquidity
      console.log("Pre-flight check: Verifying contract has enough USDC liquidity...");
      try {
        if (publicClient && USDC_ADDRESS && CORE_ADDRESS) {
          const contractUSDCBalance = await publicClient.readContract({
            address: USDC_ADDRESS,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [CORE_ADDRESS],
          });
          
          const balanceBigInt = BigInt(contractUSDCBalance.toString());
          console.log("Contract USDC balance:", {
            balance: balanceBigInt.toString(),
            needed: debtWei.toString(),
            hasEnough: balanceBigInt >= debtWei,
            balanceFormatted: formatUnits(balanceBigInt, 6),
            neededFormatted: debtAmount
          });
          
          if (balanceBigInt < debtWei) {
            setError(`Insufficient liquidity in the lending pool. The contract has ${formatUnits(balanceBigInt, 6)} USDC, but ${debtAmount} USDC is needed. Please fund the contract or reduce the loan amount.`);
            setLoading(false);
            return;
          }
        }
      } catch (liquidityError: any) {
        console.warn("Could not check liquidity (non-critical):", liquidityError);
        // Don't throw - just log and continue
        // The transaction will fail with a better error if liquidity is insufficient
        // Throwing here could cause React to unmount and disconnect the wallet
      }

      // Open loan on-chain
      setLastTxType("loan");
      console.log("Opening loan with:", {
        collateralWei: collateralWei.toString(),
        debtWei: debtWei.toString(),
        collateralAmount: collateralAmount,
        debtAmount: debtAmount,
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
      setShouldPollAllowance(false); // Stop polling once approved
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

  // Get loan counter to determine loan ID after creation
  const { refetch: refetchLoanCounter } = useReadContract({
    address: CORE_ADDRESS,
    abi: LENDING_CORE_ABI,
    functionName: "loanCounter",
    query: { 
      enabled: !!CORE_ADDRESS && isValidAddress(CORE_ADDRESS),
      refetchInterval: false,
    },
  });

  // Check USDC balance to verify loan was disbursed
  const { data: usdcBalance, refetch: refetchUSDCBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { 
      enabled: !!address && !!USDC_ADDRESS && isValidAddress(USDC_ADDRESS),
      refetchInterval: false,
    },
  });

  // Check contract's USDC liquidity
  const { data: contractUSDCBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: CORE_ADDRESS ? [CORE_ADDRESS] : undefined,
    query: { 
      enabled: !!CORE_ADDRESS && !!USDC_ADDRESS && isValidAddress(CORE_ADDRESS) && isValidAddress(USDC_ADDRESS),
      refetchInterval: false,
    },
  });

  // Handle loan opening success
  useEffect(() => {
    if (isSuccess && hash && lastTxType === "loan" && hash === currentTxHash && pendingLoanParams) {
      console.log("Loan transaction confirmed:", hash);
      const { collateral, debt } = pendingLoanParams;
      
      // Refetch loan counter to get the new loan ID (loanCounter - 1, since it increments after creation)
      refetchLoanCounter().then((result) => {
        const newLoanCounter = result.data ? Number(result.data) : null;
        const loanId = newLoanCounter !== null ? newLoanCounter - 1 : null;
        
        // Refetch balances to verify transfers
        setTimeout(() => {
          refetchBalance();
          refetchUSDCBalance();
        }, 2000); // Wait a bit for blockchain state to update
        
        if (loanId !== null) {
          setSuccess(`LOAN_ID:${loanId}:${debt}:${collateral}`);
        } else {
          setSuccess(`✅ Loan opened successfully! You received ${debt} USDC. Your ${collateral} WMATIC is locked as collateral.`);
        }
      }).catch((err) => {
        console.error("Error fetching loan counter:", err);
        setSuccess(`✅ Loan opened successfully! You received ${debt} USDC. Your ${collateral} WMATIC is locked as collateral.`);
      });
      
      setLoading(false);
      // Clear pending params and reset transaction state
      setPendingLoanParams(null);
      resetWriteContract();
      setLastTxType(null);
      setCurrentTxHash(null);
    }
  }, [isSuccess, hash, lastTxType, currentTxHash, pendingLoanParams, address, resetWriteContract, refetchLoanCounter, refetchBalance, refetchUSDCBalance]);

  // Handle transaction errors
  useEffect(() => {
    if (txError && hash === currentTxHash) {
      console.error("Transaction reverted:", hash);
      setError("Transaction failed. The transaction was sent but reverted. Check console for details.");
      setLoading(false);
      setShouldPollAllowance(false); // Stop polling on error
      // Restore form values if transaction failed (so user can retry)
      if (pendingLoanParams) {
        setCollateralAmount(pendingLoanParams.collateral);
        setDebtAmount(pendingLoanParams.debt);
        setPendingLoanParams(null);
      }
      resetWriteContract();
      setLastTxType(null);
      setCurrentTxHash(null);
    }
    if (writeError) {
      console.error("Write error:", writeError);
      const errorMsg = (writeError as any)?.message || (writeError as any)?.shortMessage || "Transaction failed";
      let userFriendlyError = "";
      
      if (errorMsg.includes("rejected") || errorMsg.includes("denied") || errorMsg.includes("User rejected")) {
        userFriendlyError = "Transaction rejected. Please try again.";
      } else if (errorMsg.includes("allowance") || errorMsg.includes("ERC20InsufficientAllowance")) {
        userFriendlyError = "Please approve WMATIC spending first. You may need to approve the token in a separate transaction.";
      } else if (errorMsg.includes("Exceeds LTV limit")) {
        userFriendlyError = "Loan-to-value ratio exceeds your tier limit. Try reducing the debt amount or increasing collateral.";
      } else if (errorMsg.includes("Insufficient liquidity")) {
        userFriendlyError = "The lending pool doesn't have enough USDC. The contract needs to be funded. Contact the administrator.";
      } else if (errorMsg.includes("No credit score set") || errorMsg.includes("tier")) {
        userFriendlyError = "Credit score not set. Please commit your score first.";
      } else if (errorMsg.includes("revert")) {
        // Try to extract the revert reason
        const revertMatch = errorMsg.match(/revert\s+(.+?)(?:\s|$)/i) || 
                           errorMsg.match(/reason[:\s]+(.+?)(?:\s|$)/i) ||
                           errorMsg.match(/execution reverted[:\s]+(.+?)(?:\s|$)/i);
        if (revertMatch && revertMatch[1]) {
          const reason = revertMatch[1].trim();
          if (reason.includes("LTV")) {
            userFriendlyError = "Loan-to-value ratio exceeds your tier limit. Try reducing the debt amount.";
          } else if (reason.includes("liquidity")) {
            userFriendlyError = "Insufficient liquidity in the lending pool. The contract needs to be funded.";
          } else if (reason.includes("credit score") || reason.includes("tier")) {
            userFriendlyError = "Credit score not set. Please commit your score first.";
          } else {
            userFriendlyError = `Transaction reverted: ${reason}`;
          }
        } else {
          userFriendlyError = `Transaction failed: ${errorMsg}`;
        }
      } else {
        userFriendlyError = `Transaction failed: ${errorMsg}`;
      }
      
      setError(userFriendlyError);
      setLoading(false);
      setShouldPollAllowance(false); // Stop polling on error
      // Restore form values if transaction failed (so user can retry)
      if (pendingLoanParams) {
        setCollateralAmount(pendingLoanParams.collateral);
        setDebtAmount(pendingLoanParams.debt);
        setPendingLoanParams(null);
      }
      resetWriteContract();
      setLastTxType(null);
      setCurrentTxHash(null);
    }
  }, [txError, writeError, hash, currentTxHash, pendingLoanParams, resetWriteContract]);

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
          setShouldPollAllowance(false); // Stop polling on timeout
          // Restore form values if transaction timed out (so user can retry)
          if (pendingLoanParams) {
            setCollateralAmount(pendingLoanParams.collateral);
            setDebtAmount(pendingLoanParams.debt);
            setPendingLoanParams(null);
          }
          setLastTxType(null);
          setCurrentTxHash(null);
        }
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [loading, committing, isPending, hash, isSuccess, txError, writeError, lastTxType, pendingLoanParams]);

  if (!isConnected) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card variant="elevated">
          <div className="text-center py-8">
            <h2 className="text-3xl font-bold mb-3 gradient-text">Connect Your Wallet</h2>
            <div className="flex justify-center mt-6">
              <ConnectButton />
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card variant="elevated">
        <h2 className="text-3xl font-bold mb-8 gradient-text">Open a Loan</h2>

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
            <div className="mb-6 p-5 glass rounded-xl border border-gray-800/50">
              <div className="flex justify-between text-sm mb-3">
                <span className="text-gray-400 font-medium">Current LTV</span>
                <span className={`font-bold text-lg ${
                  ltvPercentage > (scoreData.tier === "A" ? 70 : scoreData.tier === "B" ? 60 : 50)
                    ? "text-red-400"
                    : "text-green-400"
                }`}>
                  {ltvPercentage.toFixed(2)}%
                </span>
              </div>
              <div className="w-full bg-gray-800/60 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    ltvPercentage > (scoreData.tier === "A" ? 70 : scoreData.tier === "B" ? 60 : 50)
                      ? "bg-gradient-to-r from-red-500 to-red-600"
                      : "bg-gradient-to-r from-blue-500 to-purple-500"
                  }`}
                  style={{ width: `${Math.min(ltvPercentage, 100)}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Max LTV for Tier {scoreData.tier}: {scoreData.tier === "A" ? "70%" : scoreData.tier === "B" ? "60%" : "50%"}
              </p>
            </div>
          )}

           {/* Commit Score Step */}
           {!scoreCommitted && scoreData && (
             <div className="mb-6 p-5 bg-yellow-500/10 border border-yellow-500/30 rounded-xl backdrop-blur-sm">
               <p className="text-sm text-yellow-300 mb-2 font-semibold">
                 <strong>Step 1:</strong> Commit your score to the on-chain registry
               </p>
               <p className="text-xs text-yellow-400/80 mb-4">
                 ⓘ You only need to do this once per wallet. After committing, you can open multiple loans without committing again.
               </p>
               <button
                 type="button"
                 onClick={handleCommitScore}
                 disabled={committing}
                 className="w-full bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-700 hover:to-yellow-800 disabled:from-gray-700 disabled:to-gray-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 shadow-lg shadow-yellow-500/25 disabled:shadow-none"
               >
                 {committing ? "Committing..." : "Commit Score"}
               </button>
             </div>
           )}

           {/* WMATIC Balance and Approval Step */}
           {scoreCommitted && collateralAmount && WMATIC_ADDRESS && (
             <div className="mb-4">
               {(() => {
                 try {
                   const collateralWei = parseUnits(collateralAmount || "0", 18);
                   const allowanceBigInt = allowance ? BigInt(allowance.toString()) : 0n;
                   const balanceBigInt = wmaticBalance ? BigInt(wmaticBalance.toString()) : 0n;
                   
                   // Check if max approval (unlimited)
                   const maxUint256Value = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
                   const isMaxApproval = allowanceBigInt >= maxUint256Value - BigInt(1000);
                   
                   // Check if balance is sufficient
                   const hasEnoughBalance = balanceBigInt >= collateralWei;
                   
                   // Check if approval is needed (only if not max approval and insufficient)
                   const needsApproval = !isMaxApproval && (!allowanceBigInt || allowanceBigInt < collateralWei);
                   
                   // Show balance warning first
                   if (!hasEnoughBalance) {
                     return (
                       <div className="p-5 bg-red-500/10 border border-red-500/30 rounded-xl backdrop-blur-sm">
                         <p className="text-sm text-red-300 mb-3 font-semibold">
                           ⚠️ Insufficient WMATIC Balance
                         </p>
                         <div className="text-xs text-red-400/80 space-y-1 mb-3">
                           <p>Your balance: <strong>{formatUnits(balanceBigInt, 18)} WMATIC</strong></p>
                           <p>Required: <strong>{collateralAmount} WMATIC</strong></p>
                           <p className="text-red-300 font-semibold">You need {formatUnits(collateralWei - balanceBigInt, 18)} more WMATIC</p>
                         </div>
                       </div>
                     );
                   }
                   
                   // Then check approval
                   if (needsApproval) {
                     return (
                       <div className="p-5 bg-yellow-500/10 border border-yellow-500/30 rounded-xl backdrop-blur-sm">
                         <p className="text-sm text-yellow-300 mb-3 font-semibold">
                           <strong>Step 2:</strong> Approve WMATIC spending for this loan
                         </p>
                         <div className="text-xs text-yellow-400/80 space-y-1 mb-4">
                           <p>Your balance: <strong className="text-yellow-300">{formatUnits(balanceBigInt, 18)} WMATIC</strong> ✅</p>
                           <p>Current allowance: <strong>{formatUnits(allowanceBigInt, 18)} WMATIC</strong></p>
                           <p>Needed for this loan: <strong className="text-yellow-300">{collateralAmount} WMATIC</strong></p>
                         </div>
                         <button
                           type="button"
                           onClick={handleApprove}
                           disabled={loading || (isPending && lastTxType === "approve") || (isConfirming && lastTxType === "approve")}
                           className="w-full bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-700 hover:to-yellow-800 disabled:from-gray-700 disabled:to-gray-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 shadow-lg shadow-yellow-500/25 disabled:shadow-none"
                         >
                           {loading || (isPending && lastTxType === "approve") || (isConfirming && lastTxType === "approve") ? "Approving..." : "Approve WMATIC"}
                         </button>
                       </div>
                     );
                   } else {
                     // All good - show success
                     const approvalText = isMaxApproval ? "unlimited" : formatUnits(allowanceBigInt, 18);
                     return (
                       <div className="p-5 bg-green-500/10 border border-green-500/30 rounded-xl backdrop-blur-sm text-sm">
                         <p className="text-green-300 mb-1">✅ Balance: <strong>{formatUnits(balanceBigInt, 18)} WMATIC</strong></p>
                         <p className="text-green-300 mb-2">✅ Approval: <strong>{approvalText} WMATIC</strong></p>
                         <p className="mt-2 font-semibold text-green-200">Ready to open loan!</p>
                       </div>
                     );
                   }
                 } catch (err) {
                   return (
                     <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-300">
                       <p>Error checking balance/approval. Please check WMATIC_ADDRESS in .env.local</p>
                     </div>
                   );
                 }
               })()}
             </div>
           )}

          {/* Current Balances Display */}
          {scoreCommitted && address && (
            <div className="mb-6 p-5 glass rounded-xl border border-gray-800/50">
              <div className="font-semibold mb-4 text-gray-300 text-base">Current Balances:</div>
              <div className="space-y-1 text-xs text-gray-400">
                <div className="flex justify-between">
                  <span>Your WMATIC:</span>
                  <span className="font-mono">
                    {wmaticBalance !== undefined 
                      ? formatUnits(BigInt(wmaticBalance.toString()), 18) 
                      : "Loading..."} WMATIC
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Your USDC:</span>
                  <span className="font-mono">
                    {usdcBalance !== undefined 
                      ? formatUnits(BigInt(usdcBalance.toString()), 6) 
                      : "Loading..."} USDC
                  </span>
                </div>
                <div className="flex justify-between mt-2 pt-2 border-t border-gray-700">
                  <span>Pool USDC Liquidity:</span>
                  <span className={`font-mono ${
                    contractUSDCBalance !== undefined && debtAmount && BigInt(contractUSDCBalance.toString()) < parseUnits(debtAmount, 6)
                      ? "text-red-400"
                      : "text-green-400"
                  }`}>
                    {contractUSDCBalance !== undefined 
                      ? formatUnits(BigInt(contractUSDCBalance.toString()), 6) 
                      : "Loading..."} USDC
                  </span>
                </div>
                {contractUSDCBalance !== undefined && debtAmount && BigInt(contractUSDCBalance.toString()) < parseUnits(debtAmount, 6) && (
                  <div className="mt-2 pt-2 border-t border-gray-700 text-xs text-yellow-400">
                    ⚠️ Pool has insufficient liquidity for this loan. The contract needs to be funded with more USDC.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Info about receiving USDC */}
          {scoreCommitted && (
            <div className="mb-6 p-5 bg-blue-500/10 border border-blue-500/30 rounded-xl backdrop-blur-sm text-sm text-blue-300">
              <p className="font-semibold mb-2">Note: After opening the loan:</p>
              <ul className="list-disc list-inside mt-2 space-y-1.5 text-xs text-blue-300/80">
                <li>Your WMATIC will be locked as collateral</li>
                <li>You'll receive USDC in your wallet (same address)</li>
                <li>Check your USDC token balance in MetaMask after the transaction</li>
                <li>If USDC doesn't appear in MetaMask, import the token using the USDC contract address</li>
              </ul>
            </div>
          )}

          {(error || success) && (
            <div className="mb-6">
              {error && (
                <div className="p-5 bg-red-500/10 border border-red-500/30 rounded-xl backdrop-blur-sm text-red-400">
                  {error}
                </div>
              )}
              {success && !error && (
                <div className="p-6 bg-green-500/10 border border-green-500/30 rounded-xl backdrop-blur-sm text-green-400">
                  {success.startsWith("LOAN_ID:") ? (
                    <div className="space-y-3">
                      {(() => {
                        const parts = success.split(":");
                        const loanId = parts[1];
                        const debt = parts[2];
                        const collateral = parts[3];
                        return (
                          <>
                            <div className="font-bold text-lg mb-2">✅ Loan Opened Successfully!</div>
                            <div className="space-y-2 text-sm">
                              <div><strong>📋 Loan ID:</strong> {loanId}</div>
                              <div><strong>💰 You received:</strong> {debt} USDC</div>
                              <div><strong>🔒 Collateral locked:</strong> {collateral} WMATIC</div>
                            </div>
                            <div className="mt-5 pt-4 border-t border-green-500/30">
                              <div className="text-sm font-semibold mb-3 text-green-300">💡 To view this loan:</div>
                              <ol className="text-xs list-decimal list-inside space-y-1.5 ml-2 text-green-300/80">
                                <li>Go to "Positions" tab</li>
                                <li>Enter Loan ID: <strong className="text-green-200">{loanId}</strong></li>
                              </ol>
                            </div>
                            {usdcBalance !== undefined && (
                              <div className="mt-5 pt-4 border-t border-green-500/30">
                                <div className="text-sm space-y-2">
                                  <div className="text-green-300">
                                    <strong>Current USDC Balance:</strong> <span className="font-mono text-green-200">{formatUnits(BigInt(usdcBalance.toString()), 6)} USDC</span>
                                  </div>
                                  {USDC_ADDRESS && (
                                    <div className="text-gray-400 text-xs">
                                      <strong>USDC Contract:</strong> <span className="font-mono text-xs break-all">{USDC_ADDRESS}</span>
                                      <button
                                        onClick={() => {
                                          navigator.clipboard.writeText(USDC_ADDRESS);
                                          alert("USDC address copied to clipboard!");
                                        }}
                                        className="ml-2 text-blue-400 hover:text-blue-300 underline transition-colors"
                                      >
                                        Copy
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <div>{success}</div>
                  )}
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || isPending || isConfirming || !scoreCommitted}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 shadow-lg shadow-blue-500/25 disabled:shadow-none text-lg"
          >
            {loading || isPending || isConfirming
              ? "Processing..."
              : scoreCommitted
              ? "Open Loan"
              : "Commit Score First"}
          </button>
        </form>

        <div className="mt-8 p-5 glass rounded-xl border border-gray-800/50">
          <p className="mb-3 font-semibold text-gray-300">
            LTV Limits by Tier:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <div className="font-bold text-blue-400">Tier A</div>
              <div className="text-xs text-gray-400 mt-1">70% LTV, 6% APR</div>
            </div>
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <div className="font-bold text-yellow-400">Tier B</div>
              <div className="text-xs text-gray-400 mt-1">60% LTV, 9% APR</div>
            </div>
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <div className="font-bold text-red-400">Tier C</div>
              <div className="text-xs text-gray-400 mt-1">50% LTV, 12% APR</div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}