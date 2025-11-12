import { useState, useEffect } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Card } from "../components/Card";
import { Input } from "../components/Input";
import { CORE_ADDRESS, LENDING_CORE_ABI, SCORE_ADDRESS, SCORE_REGISTRY_ABI, isValidAddress } from "../lib/contracts";
import { parseUnits, formatUnits } from "viem";

export function Positions() {
  const { isConnected } = useAccount();
  const [loanId, setLoanId] = useState("");
  const [repayAmount, setRepayAmount] = useState("");
  const [healthFactor, setHealthFactor] = useState<string | null>(null);

  const { data: loanData } = useReadContract({
    address: CORE_ADDRESS,
    abi: LENDING_CORE_ABI,
    functionName: "loans",
    args: loanId ? [BigInt(loanId)] : undefined,
    query: { enabled: !!loanId && !!CORE_ADDRESS },
  }) as { data?: readonly [string, string, string, bigint, bigint, bigint, bigint, bigint, boolean] };

  const { data: hfData } = useReadContract({
    address: CORE_ADDRESS,
    abi: LENDING_CORE_ABI,
    functionName: "healthFactor",
    args: loanId ? [BigInt(loanId)] : undefined,
    query: { enabled: !!loanId && !!CORE_ADDRESS },
  });

  // Get tier for the borrower
  const { data: borrowerTier } = useReadContract({
    address: SCORE_ADDRESS,
    abi: SCORE_REGISTRY_ABI,
    functionName: "getTier",
    args: loanData ? [loanData[0] as string] : undefined,
    query: { enabled: !!loanData && !!SCORE_ADDRESS },
  });

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  useEffect(() => {
    if (hfData !== undefined) {
      const hf = Number(hfData) / 1e18;
      setHealthFactor(hf.toFixed(4));
    }
  }, [hfData]);

  const handleRepay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanId || !repayAmount) return;

    const repayWei = parseUnits(repayAmount, 6); // USDC has 6 decimals

    writeContract({
      address: CORE_ADDRESS,
      abi: LENDING_CORE_ABI,
      functionName: "repay",
      args: [BigInt(loanId), repayWei],
    });
  };

  useEffect(() => {
    if (isSuccess) {
      setRepayAmount("");
      alert("Repayment successful!");
    }
  }, [isSuccess]);

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
        <h2 className="text-2xl font-bold mb-6">Your Positions</h2>

        <Input
          label="Loan ID"
          type="number"
          value={loanId}
          onChange={(e) => setLoanId(e.target.value)}
          placeholder="0"
        />

        {loanData && (
          <div className="mt-6 space-y-4">
            <div className="p-4 bg-gray-800 rounded-lg">
              <h3 className="font-semibold mb-3">Loan Details</h3>
              <div className="space-y-2 text-sm">
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
                  <span className="text-gray-400">Debt:</span>
                  <span>{formatUnits(BigInt(loanData[4] as bigint), 6)} USDC</span>
                </div>
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
              <div className="p-4 bg-gray-800 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Health Factor:</span>
                  <span
                    className={`text-xl font-bold ${
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

            <form onSubmit={handleRepay} className="mt-6">
              <Input
                label="Repay Amount (USDC)"
                type="number"
                step="0.01"
                value={repayAmount}
                onChange={(e) => setRepayAmount(e.target.value)}
                placeholder="0.0"
              />

              <button
                type="submit"
                disabled={!repayAmount || isPending || isConfirming}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                {isPending || isConfirming ? "Processing..." : "Repay"}
              </button>
            </form>
          </div>
        )}
      </Card>
    </div>
  );
}

