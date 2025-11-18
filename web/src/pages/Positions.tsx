import { useState, useEffect, useMemo } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Card } from "../components/Card";
import { Input } from "../components/Input";
import { CORE_ADDRESS, LENDING_CORE_ABI, SCORE_ADDRESS, SCORE_REGISTRY_ABI, USDC_ADDRESS, ERC20_ABI, isValidAddress } from "../lib/contracts";
import { parseUnits, formatUnits, maxUint256 } from "viem";

interface LoanInfo {
  loanId: number;
  borrower: string;
  collateralAmount: bigint;
  debtAmount: bigint;
  interestRate: bigint;
  createdAt: bigint;
  lastAccruedAt: bigint;
  active: boolean;
}

export function Positions() {
  const { isConnected, address } = useAccount();
  const publicClient = usePublicClient();
  const [loanId, setLoanId] = useState("");
  const [repayAmount, setRepayAmount] = useState("");
  const [healthFactor, setHealthFactor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [lastTxType, setLastTxType] = useState<"approve" | "repay" | null>(null);
  const [currentTxHash, setCurrentTxHash] = useState<`0x${string}` | null>(null);
  const [userLoans, setUserLoans] = useState<LoanInfo[]>([]);
  const [loadingLoans, setLoadingLoans] = useState(false);
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);

  // Get loan counter to know how many loans exist
  const { data: loanCounter } = useReadContract({
    address: CORE_ADDRESS,
    abi: LENDING_CORE_ABI,
    functionName: "loanCounter",
    query: { 
      enabled: !!CORE_ADDRESS && isValidAddress(CORE_ADDRESS),
      refetchInterval: false,
    },
  });

  // Fetch all user's loans
  useEffect(() => {
    const fetchUserLoans = async () => {
      if (!address || !CORE_ADDRESS || !publicClient || !loanCounter) return;
      
      setLoadingLoans(true);
      try {
        const totalLoans = Number(loanCounter);
        const loans: LoanInfo[] = [];
        
        // Check up to 100 most recent loans (for performance)
        const maxLoansToCheck = Math.min(100, totalLoans);
        
        console.log(`Fetching loans for ${address}, checking ${maxLoansToCheck} most recent loans...`);
        
        // Query loans in parallel batches for better performance
        const batchSize = 10;
        for (let i = 0; i < maxLoansToCheck; i += batchSize) {
          const batch = [];
          for (let j = 0; j < batchSize && (i + j) < maxLoansToCheck; j++) {
            const loanId = totalLoans - 1 - (i + j);
            if (loanId < 0) break;
            
            batch.push(
              publicClient.readContract({
                address: CORE_ADDRESS,
                abi: LENDING_CORE_ABI,
                functionName: "loans",
                args: [BigInt(loanId)],
              }).then((loanData: any) => {
                if (loanData && Array.isArray(loanData) && loanData.length >= 9) {
                  const borrower = loanData[0] as string;
                  // Only include loans for this user
                  if (borrower.toLowerCase() === address.toLowerCase()) {
                    return {
                      loanId,
                      borrower,
                      collateralAmount: BigInt(loanData[3] as bigint),
                      debtAmount: BigInt(loanData[4] as bigint),
                      interestRate: BigInt(loanData[5] as bigint),
                      createdAt: BigInt(loanData[6] as bigint),
                      lastAccruedAt: BigInt(loanData[7] as bigint),
                      active: loanData[8] as boolean,
                    } as LoanInfo;
                  }
                }
                return null;
              }).catch(() => null)
            );
          }
          
          const batchResults = await Promise.all(batch);
          const validLoans = batchResults.filter((loan): loan is LoanInfo => loan !== null);
          loans.push(...validLoans);
        }
        
        // Sort by loan ID (newest first)
        loans.sort((a, b) => b.loanId - a.loanId);
        
        console.log(`Found ${loans.length} loans for user ${address}`);
        setUserLoans(loans);
      } catch (err) {
        console.error("Error fetching user loans:", err);
      } finally {
        setLoadingLoans(false);
      }
    };

    if (isConnected && address && loanCounter !== undefined) {
      fetchUserLoans();
    } else {
      setUserLoans([]);
    }
  }, [address, isConnected, loanCounter, publicClient, CORE_ADDRESS]);

  // Validate loanId is a valid number
  const isValidLoanId = loanId && !isNaN(Number(loanId)) && Number(loanId) >= 0;

  const { data: loanData, error: loanError, refetch: refetchLoan } = useReadContract({
    address: CORE_ADDRESS,
    abi: LENDING_CORE_ABI,
    functionName: "loans",
    args: isValidLoanId ? [BigInt(loanId)] : undefined,
    query: { 
      enabled: isValidLoanId && !!CORE_ADDRESS && isValidAddress(CORE_ADDRESS),
      refetchInterval: false,
      retry: false,
    },
  }) as { data?: readonly [string, string, string, bigint, bigint, bigint, bigint, bigint, boolean]; error?: Error; refetch: () => Promise<any> };

  // Check if loan exists and is valid
  const loanExists = useMemo(() => {
    if (!loanData || !Array.isArray(loanData) || loanData.length < 9) return false;
    const borrower = loanData[0] as string;
    // Loan exists if borrower is not zero address
    return borrower && borrower !== "0x0000000000000000000000000000000000000000";
  }, [loanData]);

  // Only call healthFactor if loan exists and is active
  const isLoanActive = loanData && Array.isArray(loanData) && loanData.length >= 9 && loanData[8] === true && loanExists;
  const borrowerAddress = loanData && Array.isArray(loanData) ? loanData[0] as string : null;
  const isBorrower = address && borrowerAddress && address.toLowerCase() === borrowerAddress.toLowerCase();

  // Calculate current debt with accrued interest
  const currentDebt = useMemo(() => {
    if (!loanData || !Array.isArray(loanData) || loanData.length < 9 || !loanExists) return null;
    
    const debtAmount = BigInt(loanData[4] as bigint);
    const interestRate = Number(loanData[5]);
    const lastAccruedAt = Number(loanData[7]);
    
    if (debtAmount === 0n) return 0n;
    
    const now = Math.floor(Date.now() / 1000);
    const timeElapsed = now - lastAccruedAt;
    
    if (timeElapsed <= 0) return debtAmount;
    
    // Simple interest: debt * rate * time / (365 days * 86400 seconds * 10000 bps)
    const interest = (debtAmount * BigInt(interestRate) * BigInt(timeElapsed)) / BigInt(365 * 86400 * 10000);
    return debtAmount + interest;
  }, [loanData, loanExists]);

  // Calculate interest accrued
  const interestAccrued = useMemo(() => {
    if (!loanData || !Array.isArray(loanData) || loanData.length < 9 || !loanExists) return null;
    if (!currentDebt) return null;
    
    const originalDebt = BigInt(loanData[4] as bigint);
    return currentDebt - originalDebt;
  }, [loanData, currentDebt, loanExists]);

  const { data: hfData, error: hfError } = useReadContract({
    address: CORE_ADDRESS,
    abi: LENDING_CORE_ABI,
    functionName: "healthFactor",
    args: isValidLoanId && isLoanActive ? [BigInt(loanId)] : undefined,
    query: { 
      enabled: isValidLoanId && isLoanActive && !!CORE_ADDRESS && isValidAddress(CORE_ADDRESS),
      refetchInterval: false,
      retry: false,
    },
  });

  // Get tier for the borrower
  const { data: borrowerTier } = useReadContract({
    address: SCORE_ADDRESS,
    abi: SCORE_REGISTRY_ABI,
    functionName: "getTier",
    args: borrowerAddress ? [borrowerAddress as `0x${string}`] : undefined,
    query: { enabled: !!borrowerAddress && !!SCORE_ADDRESS && isValidAddress(SCORE_ADDRESS) },
  });

  // Check USDC balance
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

  // Check USDC allowance
  const { data: usdcAllowance, refetch: refetchUSDCAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && CORE_ADDRESS ? [address, CORE_ADDRESS] : undefined,
    query: { 
      enabled: !!address && !!USDC_ADDRESS && !!CORE_ADDRESS && isValidAddress(USDC_ADDRESS) && isValidAddress(CORE_ADDRESS),
      refetchInterval: false,
    },
  });

  const { writeContract, data: hash, isPending, isSuccess, error: writeError, reset: resetWriteContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: txSuccess, error: txError } = useWaitForTransactionReceipt({
    hash,
  });

  useEffect(() => {
    if (hfData !== undefined && hfData !== null) {
      const hf = Number(hfData) / 1e18;
      setHealthFactor(hf.toFixed(4));
    } else if (hfError || !isLoanActive) {
      setHealthFactor(null);
    }
  }, [hfData, hfError, isLoanActive]);

  // Track transaction hash
  useEffect(() => {
    if (hash) {
      setCurrentTxHash(hash);
    }
  }, [hash]);

  // Handle approval success
  useEffect(() => {
    if (isSuccess && hash && lastTxType === "approve" && hash === currentTxHash) {
      console.log("USDC approval confirmed:", hash);
      setApproving(false);
      setSuccess("✅ USDC approved! You can now repay the loan.");
      setTimeout(() => {
        refetchUSDCAllowance();
        resetWriteContract();
        setLastTxType(null);
        setCurrentTxHash(null);
        setSuccess(null);
      }, 2000);
    }
  }, [isSuccess, hash, lastTxType, currentTxHash, refetchUSDCAllowance, resetWriteContract]);

  // Handle repay success
  useEffect(() => {
    if (txSuccess && hash && lastTxType === "repay" && hash === currentTxHash) {
      console.log("Repayment confirmed:", hash);
      setLoading(false);
      setRepayAmount("");
      
      // Check if loan is fully repaid
      const isFullyRepaid = currentDebt && repayAmount && 
        BigInt(parseUnits(repayAmount, 6).toString()) >= currentDebt;
      
      if (isFullyRepaid) {
        setSuccess("✅ Loan fully repaid! Your collateral has been released. Check your WMATIC balance.");
      } else {
        setSuccess(`✅ Repayment successful! You repaid ${repayAmount} USDC.`);
      }
      
      // Refetch loan data and balances
      setTimeout(() => {
        refetchLoan();
        refetchUSDCBalance();
        // Refetch user loans list to update
        if (address && loanCounter !== undefined) {
          // Trigger re-fetch by updating a dependency
          setUserLoans([]);
        }
        resetWriteContract();
        setLastTxType(null);
        setCurrentTxHash(null);
        setSuccess(null);
      }, 3000);
    }
  }, [txSuccess, hash, lastTxType, currentTxHash, repayAmount, currentDebt, refetchLoan, refetchUSDCBalance, resetWriteContract, address, loanCounter]);

  // Handle errors
  useEffect(() => {
    if (txError) {
      console.error("Transaction error:", txError);
      setError("Transaction failed. Check console for details.");
      setLoading(false);
      setApproving(false);
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
        userFriendlyError = "Please approve USDC spending first.";
      } else if (errorMsg.includes("Exceeds debt") || errorMsg.includes("Repay exceeds")) {
        userFriendlyError = "Repayment amount exceeds current debt. Use 'Repay Max' to repay the full amount.";
      } else if (errorMsg.includes("Not borrower")) {
        userFriendlyError = "You are not the borrower of this loan.";
      } else if (errorMsg.includes("revert")) {
        const revertMatch = errorMsg.match(/revert\s+(.+?)(?:\s|$)/i) || 
                           errorMsg.match(/reason[:\s]+(.+?)(?:\s|$)/i) ||
                           errorMsg.match(/execution reverted[:\s]+(.+?)(?:\s|$)/i);
        if (revertMatch && revertMatch[1]) {
          userFriendlyError = `Transaction reverted: ${revertMatch[1]}`;
        } else {
          userFriendlyError = `Transaction failed: ${errorMsg}`;
        }
      } else {
        userFriendlyError = `Transaction failed: ${errorMsg}`;
      }
      
      setError(userFriendlyError);
      setLoading(false);
      setApproving(false);
      resetWriteContract();
      setLastTxType(null);
      setCurrentTxHash(null);
    }
  }, [txError, writeError, resetWriteContract]);

  // Handle loan error - check if loan doesn't exist
  useEffect(() => {
    if (loanId && isValidLoanId && loanData !== undefined) {
      if (!loanExists) {
        setError(`Loan ID ${loanId} does not exist. Please check the loan ID and try again.`);
      } else {
        // Clear error if loan exists
        if (error && error.includes("does not exist")) {
          setError(null);
        }
      }
    }
  }, [loanId, isValidLoanId, loanData, loanExists, error]);

  const handleApprove = async () => {
    if (!address || !CORE_ADDRESS || !USDC_ADDRESS) {
      setError("Missing required addresses. Check your .env.local file.");
      return;
    }

    setError(null);
    setApproving(true);
    setLastTxType("approve");

    try {
      writeContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CORE_ADDRESS, maxUint256],
      });
    } catch (err: any) {
      console.error("Approval error:", err);
      setError(err?.message || "Failed to approve USDC");
      setApproving(false);
      setLastTxType(null);
    }
  };

  const handleRepayMax = () => {
    if (!currentDebt) return;
    const maxRepay = formatUnits(currentDebt, 6);
    setRepayAmount(maxRepay);
  };

  const handleRepay = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!loanId || !repayAmount) {
      setError("Please enter a repayment amount");
      return;
    }

    if (!address || !CORE_ADDRESS || !USDC_ADDRESS) {
      setError("Missing required addresses. Check your .env.local file.");
      return;
    }

    if (!isBorrower) {
      setError("You are not the borrower of this loan. Only the borrower can repay.");
      return;
    }

    if (!isLoanActive) {
      setError("This loan is not active.");
      return;
    }

    if (!currentDebt) {
      setError("Unable to calculate current debt. Please try again.");
      return;
    }

    const repayWei = parseUnits(repayAmount, 6);
    const currentDebtWei = currentDebt;

    // Check if user has enough USDC
    if (!usdcBalance || BigInt(usdcBalance.toString()) < repayWei) {
      const balance = usdcBalance ? formatUnits(BigInt(usdcBalance.toString()), 6) : "0";
      setError(`Insufficient USDC balance. You have ${balance} USDC, but need ${repayAmount} USDC.`);
      return;
    }

    // Check if repayment exceeds debt
    if (repayWei > currentDebtWei) {
      const maxRepay = formatUnits(currentDebtWei, 6);
      setError(`Repayment amount exceeds current debt. Maximum repayment: ${maxRepay} USDC. Use 'Repay Max' to repay the full amount.`);
      return;
    }

    // Check USDC allowance
    const maxUint256Value = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
    const isMaxApproval = usdcAllowance && BigInt(usdcAllowance.toString()) >= maxUint256Value - BigInt(1000);
    
    if (!isMaxApproval && (!usdcAllowance || BigInt(usdcAllowance.toString()) < repayWei)) {
      setError("Please approve USDC spending first.");
      return;
    }

    setLoading(true);
    setLastTxType("repay");

    try {
      writeContract({
        address: CORE_ADDRESS,
        abi: LENDING_CORE_ABI,
        functionName: "repay",
        args: [BigInt(loanId), repayWei],
      });
    } catch (err: any) {
      console.error("Repay error:", err);
      setError(err?.message || "Failed to initiate repayment");
      setLoading(false);
      setLastTxType(null);
    }
  };

  const handleLoanSelect = (id: number) => {
    setLoanId(id.toString());
    setSelectedLoanId(id.toString());
    setError(null);
    setSuccess(null);
  };

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
    <div className="max-w-4xl mx-auto">
      <Card variant="elevated">
        <h2 className="text-3xl font-bold mb-8 gradient-text">Your Positions</h2>

        {/* User's Loans List */}
        {loadingLoans && (
          <div className="mb-6 p-6 glass rounded-xl border border-gray-800/50">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-300">Loading your loans...</p>
            </div>
          </div>
        )}

        {!loadingLoans && userLoans.length > 0 && (
          <div className="mb-8">
            <h3 className="text-xl font-bold mb-4 text-gray-200">Your Loans</h3>
            <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
              {userLoans.map((loan) => {
                const isSelected = selectedLoanId === loan.loanId.toString();
                return (
                  <button
                    key={loan.loanId}
                    onClick={() => handleLoanSelect(loan.loanId)}
                    className={`w-full p-4 rounded-xl border transition-all duration-200 text-left ${
                      isSelected
                        ? "bg-gradient-to-r from-blue-500/20 to-purple-500/20 border-blue-500/50 shadow-lg shadow-blue-500/10"
                        : "glass border-gray-800/50 hover:border-gray-700/50 hover:bg-gray-800/30"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-bold text-lg mb-1">
                          Loan #{loan.loanId}
                        </div>
                        <div className="text-sm text-gray-400">
                          {formatUnits(loan.collateralAmount, 18)} WMATIC → {formatUnits(loan.debtAmount, 6)} USDC
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-xs px-3 py-1.5 rounded-lg font-semibold ${
                          loan.active ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-gray-700/50 text-gray-400 border border-gray-700/50"
                        }`}>
                          {loan.active ? "Active" : "Closed"}
                        </div>
                        <div className="text-xs text-gray-500 mt-2">
                          {new Date(Number(loan.createdAt) * 1000).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {!loadingLoans && userLoans.length === 0 && (
          <div className="mb-8 p-6 glass rounded-xl border border-gray-800/50 text-center">
            <p className="text-gray-400 text-lg">
              You don't have any loans yet. Go to the "Borrow" tab to open your first loan.
            </p>
          </div>
        )}

        {/* Manual Loan ID Input */}
        <div className="mb-6">
          <Input
            label="Or Enter Loan ID Manually"
            type="number"
            value={loanId}
            onChange={(e) => {
              setLoanId(e.target.value);
              setSelectedLoanId(null);
              setError(null);
            }}
            placeholder="0"
          />
        </div>

        {/* Error for invalid/non-existent loan */}
        {loanId && isValidLoanId && loanData !== undefined && !loanExists && (
          <div className="mb-6 p-5 bg-red-500/10 border border-red-500/30 rounded-xl backdrop-blur-sm text-red-400">
            <p className="font-semibold mb-2">❌ Loan ID {loanId} does not exist or has never been created.</p>
            <p className="text-sm text-red-400/80">Please check the loan ID and try again.</p>
            {loanCounter !== undefined && (
              <div className="mt-3 text-xs text-gray-400 bg-gray-800/50 p-2 rounded-lg">
                Valid loan IDs range from 0 to {Number(loanCounter) - 1}
              </div>
            )}
          </div>
        )}

        {loanError && loanId && isValidLoanId && (
          <div className="mb-6 p-5 bg-red-500/10 border border-red-500/30 rounded-xl backdrop-blur-sm text-red-400">
            Error loading loan: {loanError.message || "Unknown error"}
          </div>
        )}

        {loanData && loanExists && (
          <div className="mt-8 space-y-6">
            {/* Borrower verification */}
            {!isBorrower && (
              <div className="p-5 bg-yellow-500/10 border border-yellow-500/30 rounded-xl backdrop-blur-sm text-yellow-400">
                <p className="font-semibold">⚠️ You are not the borrower of this loan.</p>
                <p className="text-sm text-yellow-400/80 mt-1">Only the borrower can view and repay this loan.</p>
              </div>
            )}

            <div className="p-6 glass rounded-xl border border-gray-800/50">
              <h3 className="font-bold text-xl mb-5 text-gray-200">Loan Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Loan ID:</span>
                  <span className="font-mono">#{loanId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Borrower:</span>
                  <span className="font-mono text-xs">
                    {String(loanData[0])}
                  </span>
                </div>
                {borrowerTier !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Tier:</span>
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      borrowerTier === 2 ? "bg-green-600" : borrowerTier === 1 ? "bg-yellow-600" : "bg-red-600"
                    }`}>
                      {borrowerTier === 2 ? "A" : borrowerTier === 1 ? "B" : "C"}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-400">Collateral:</span>
                  <span>
                    {formatUnits(BigInt(loanData[3] as bigint), 18)} WMATIC
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Original Debt:</span>
                  <span>{formatUnits(BigInt(loanData[4] as bigint), 6)} USDC</span>
                </div>
                {currentDebt !== null && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Current Debt (with interest):</span>
                      <span className="font-bold text-yellow-400">
                        {formatUnits(currentDebt, 6)} USDC
                      </span>
                    </div>
                    {interestAccrued !== null && interestAccrued > 0n && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Interest Accrued:</span>
                        <span className="text-yellow-400">
                          +{formatUnits(interestAccrued, 6)} USDC
                        </span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-400">Interest Rate:</span>
                  <span>{(Number(loanData[5]) / 100).toFixed(2)}% APR</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Created:</span>
                  <span>{new Date(Number(loanData[6]) * 1000).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Last Accrued:</span>
                  <span>{new Date(Number(loanData[7]) * 1000).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Status:</span>
                  <span>{loanData[8] ? "Active" : "Closed"}</span>
                </div>
              </div>
            </div>

            {healthFactor !== null && (
              <div className="p-6 glass rounded-xl border border-gray-800/50">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 font-semibold">Health Factor:</span>
                  <span
                    className={`text-2xl font-bold ${
                      Number(healthFactor) < 1
                        ? "text-red-400"
                        : Number(healthFactor) < 1.5
                        ? "text-yellow-400"
                        : "text-green-400"
                    }`}
                  >
                    {healthFactor}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {Number(healthFactor) < 1
                    ? "⚠️ Loan is liquidatable"
                    : Number(healthFactor) < 1.5
                    ? "⚠️ Low health factor"
                    : "✓ Healthy"}
                </p>
              </div>
            )}

            {/* USDC Balance and Approval */}
            {isBorrower && isLoanActive && (
              <div className="p-6 glass rounded-xl border border-gray-800/50">
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 font-medium">Your USDC Balance:</span>
                    <span className="font-bold text-gray-200">
                      {usdcBalance !== undefined 
                        ? formatUnits(BigInt(usdcBalance.toString()), 6) 
                        : "Loading..."} USDC
                    </span>
                  </div>
                  {usdcAllowance !== undefined && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-medium">USDC Approval:</span>
                      <span className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                        BigInt(usdcAllowance.toString()) > 0n 
                          ? "bg-green-500/20 text-green-400 border border-green-500/30" 
                          : "bg-red-500/20 text-red-400 border border-red-500/30"
                      }`}>
                        {BigInt(usdcAllowance.toString()) > 0n ? "Approved" : "Not Approved"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Repay Form */}
            {isBorrower && isLoanActive && (
              <form onSubmit={handleRepay} className="mt-6 space-y-6">
                {(error || success) && (
                  <div>
                    {error && (
                      <div className="p-5 bg-red-500/10 border border-red-500/30 rounded-xl backdrop-blur-sm text-red-400">
                        {error}
                      </div>
                    )}
                    {success && !error && (
                      <div className="p-5 bg-green-500/10 border border-green-500/30 rounded-xl backdrop-blur-sm text-green-400">
                        {success}
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="block text-sm font-medium text-gray-300">
                      Repay Amount (USDC)
                    </label>
                    {currentDebt !== null && (
                      <button
                        type="button"
                        onClick={handleRepayMax}
                        className="text-xs text-blue-400 hover:text-blue-300 underline"
                      >
                        Repay Max ({formatUnits(currentDebt, 6)} USDC)
                      </button>
                    )}
                  </div>
                  <Input
                    type="number"
                    step="0.01"
                    value={repayAmount}
                    onChange={(e) => {
                      setRepayAmount(e.target.value);
                      setError(null);
                    }}
                    placeholder="0.0"
                    disabled={loading || approving}
                  />
                  {currentDebt !== null && repayAmount && (
                    <div className="text-xs text-gray-400">
                      After repayment: {formatUnits(currentDebt - parseUnits(repayAmount || "0", 6), 6)} USDC remaining
                      {parseUnits(repayAmount || "0", 6) >= currentDebt && (
                        <span className="text-green-400 ml-2">(Loan will be fully repaid)</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Approval button if needed */}
                {usdcAllowance !== undefined && currentDebt !== null && repayAmount && (
                  (() => {
                    const repayWei = parseUnits(repayAmount, 6);
                    const maxUint256Value = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
                    const isMaxApproval = BigInt(usdcAllowance.toString()) >= maxUint256Value - BigInt(1000);
                    const needsApproval = !isMaxApproval && (BigInt(usdcAllowance.toString()) < repayWei);
                    
                    if (needsApproval) {
                      return (
                        <button
                          type="button"
                          onClick={handleApprove}
                          disabled={approving || (isPending && lastTxType === "approve") || (isConfirming && lastTxType === "approve")}
                          className="w-full bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-700 hover:to-yellow-800 disabled:from-gray-700 disabled:to-gray-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 shadow-lg shadow-yellow-500/25 disabled:shadow-none"
                        >
                          {approving || (isPending && lastTxType === "approve") || (isConfirming && lastTxType === "approve") 
                            ? "Approving..." 
                            : "Approve USDC"}
                        </button>
                      );
                    }
                    return null;
                  })()
                )}

                <button
                  type="submit"
                  disabled={
                    !repayAmount || 
                    loading || 
                    approving ||
                    isPending || 
                    isConfirming ||
                    (usdcAllowance !== undefined && currentDebt !== null && repayAmount && (() => {
                      const repayWei = parseUnits(repayAmount, 6);
                      const maxUint256Value = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
                      const isMaxApproval = BigInt(usdcAllowance.toString()) >= maxUint256Value - BigInt(1000);
                      return !isMaxApproval && BigInt(usdcAllowance.toString()) < repayWei;
                    })())
                  }
                  className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 shadow-lg shadow-green-500/25 disabled:shadow-none text-lg"
                >
                  {loading || (isPending && lastTxType === "repay") || (isConfirming && lastTxType === "repay") 
                    ? "Processing..." 
                    : "Repay"}
                </button>
              </form>
            )}

            {!isLoanActive && (
              <div className="p-5 glass rounded-xl border border-gray-800/50 text-center">
                <p className="text-gray-400">
                  This loan is closed. No repayment needed.
                </p>
              </div>
            )}
          </div>
        )}

        {!loanId && userLoans.length === 0 && !loadingLoans && (
          <div className="p-6 glass rounded-xl border border-gray-800/50 text-center">
            <p className="text-gray-400 text-lg">
              No loans found. Enter a loan ID above or open a new loan in the "Borrow" tab.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
