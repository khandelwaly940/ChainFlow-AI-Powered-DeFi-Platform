import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Card } from "../components/Card";

interface ScoreData {
  address: string;
  score: number;
  tier: "A" | "B" | "C";
  signals: {
    walletAge: number;
    recentTxCount: number;
    stablecoinHoldingScore: number;
  };
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export function Dashboard() {
  const { address, isConnected } = useAccount();
  const [scoreData, setScoreData] = useState<ScoreData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isConnected && address) {
      fetchScore();
    }
  }, [address, isConnected]);

  const fetchScore = async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/score/${address}`);
      if (!response.ok) throw new Error("Failed to fetch score");
      const data = await response.json();
      setScoreData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case "A":
        return "bg-green-600";
      case "B":
        return "bg-yellow-600";
      case "C":
        return "bg-red-600";
      default:
        return "bg-gray-600";
    }
  };

  if (!isConnected) {
    return (
      <div className="max-w-2xl mx-auto mt-12">
        <Card>
          <h2 className="text-2xl font-bold mb-4">Connect Your Wallet</h2>
          <p className="text-gray-400 mb-6">
            Connect your MetaMask wallet to view your credit score and start
            borrowing.
          </p>
          <ConnectButton />
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto mt-12">
      <Card>
        <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

        {loading && <p className="text-gray-400">Loading score...</p>}
        {error && <p className="text-red-400">Error: {error}</p>}

        {scoreData && (
          <div>
            <div className="mb-6">
              <div className="flex items-center gap-4 mb-4">
                <span className="text-gray-400">Credit Tier:</span>
                <span
                  className={`px-4 py-2 rounded-full text-white font-bold ${getTierColor(
                    scoreData.tier
                  )}`}
                >
                  Tier {scoreData.tier}
                </span>
              </div>
              <div className="flex items-center gap-4 mb-4">
                <span className="text-gray-400">Credit Score:</span>
                <span className="text-2xl font-bold">{scoreData.score}/100</span>
              </div>
            </div>

            <div className="border-t border-gray-800 pt-6">
              <h3 className="text-lg font-semibold mb-4">Score Signals</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Wallet Age:</span>
                  <span>{scoreData.signals.walletAge} days</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Recent Transactions:</span>
                  <span>{scoreData.signals.recentTxCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Stablecoin Score:</span>
                  <span>{scoreData.signals.stablecoinHoldingScore}/100</span>
                </div>
              </div>
            </div>

            <div className="mt-6 p-4 bg-blue-900/20 border border-blue-800 rounded-lg">
              <p className="text-sm text-gray-300 mb-3">
                <strong>About Your Tier:</strong> Your credit tier determines your loan-to-value (LTV) limit and annual percentage rate (APR). Higher tiers get better terms.
              </p>
            </div>

            {/* Quick Links */}
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => window.location.hash = "borrow"}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                Open Loan
              </button>
              <button
                onClick={() => window.location.hash = "positions"}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                View Positions
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

