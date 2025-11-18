import { useEffect, useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Card } from "../components/Card";

interface ScoreData {
  address: string;
  score: number;
  tier: "A" | "B" | "C";
  method?: "ml" | "heuristic"; // AI/ML method indicator
  signals: {
    walletAge: number;
    recentTxCount: number;
    stablecoinHoldingScore: number;
    loanHistoryScore: number;
  };
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export function Dashboard() {
  const { address, isConnected } = useAccount();
  const [scoreData, setScoreData] = useState<ScoreData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if score can be refreshed (once per day)
  const canRefreshScore = useCallback((): boolean => {
    if (!address) return false;
    const lastRefreshKey = `score_refresh_${address.toLowerCase()}`;
    const lastRefresh = localStorage.getItem(lastRefreshKey);
    
    if (!lastRefresh) return true; // Never refreshed before
    
    const lastRefreshTime = parseInt(lastRefresh, 10);
    const now = Date.now();
    const oneDayInMs = 24 * 60 * 60 * 1000;
    
    return (now - lastRefreshTime) >= oneDayInMs;
  }, [address]);

  const getNextRefreshTime = useCallback((): string | null => {
    if (!address) return null;
    const lastRefreshKey = `score_refresh_${address.toLowerCase()}`;
    const lastRefresh = localStorage.getItem(lastRefreshKey);
    
    if (!lastRefresh) return null;
    
    const lastRefreshTime = parseInt(lastRefresh, 10);
    const nextRefreshTime = lastRefreshTime + (24 * 60 * 60 * 1000);
    const now = Date.now();
    
    if (nextRefreshTime <= now) return null;
    
    const hoursUntil = Math.floor((nextRefreshTime - now) / (60 * 60 * 1000));
    const minutesUntil = Math.floor(((nextRefreshTime - now) % (60 * 60 * 1000)) / (60 * 1000));
    
    if (hoursUntil > 0) {
      return `${hoursUntil}h ${minutesUntil}m`;
    }
    return `${minutesUntil}m`;
  }, [address]);

  const fetchScore = useCallback(async (force: boolean = false) => {
    if (!address) return;
    
    // Check if can refresh (once per day limit) - unless forced (for initial load)
    if (!force && !canRefreshScore()) {
      const nextRefresh = getNextRefreshTime();
      setError(`Score can only be refreshed once per day. Next refresh available in ${nextRefresh || "soon"}.`);
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      console.log("🔄 Fetching fresh score from blockchain...");
      const response = await fetch(`${API_URL}/score/${address}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to fetch score");
      }
      const data = await response.json();
      console.log("✅ Received updated score:", data);
      
      // Update score data
      setScoreData(data);
      
      // Store refresh timestamp and cache score data
      const lastRefreshKey = `score_refresh_${address.toLowerCase()}`;
      const cachedScoreKey = `cached_score_${address.toLowerCase()}`;
      localStorage.setItem(lastRefreshKey, Date.now().toString());
      localStorage.setItem(cachedScoreKey, JSON.stringify(data));
      console.log("💾 Score cached and timestamp stored");
    } catch (err) {
      console.error("❌ Error fetching score:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      // On error, try to keep showing cached data if available
      const cachedScoreKey = `cached_score_${address.toLowerCase()}`;
      const cachedScore = localStorage.getItem(cachedScoreKey);
      if (cachedScore) {
        try {
          setScoreData(JSON.parse(cachedScore));
          setError(null); // Clear error if we have cached data
        } catch {
          // Ignore parse errors
        }
      }
    } finally {
      setLoading(false);
    }
  }, [address, canRefreshScore, getNextRefreshTime]);

  // Load cached score on mount or address change
  useEffect(() => {
    if (isConnected && address) {
      // Always try to load cached score first (so dashboard shows something immediately)
      const cachedScoreKey = `cached_score_${address.toLowerCase()}`;
      const cachedScore = localStorage.getItem(cachedScoreKey);
      if (cachedScore) {
        try {
          const parsed = JSON.parse(cachedScore);
          setScoreData(parsed);
          console.log("✅ Loaded cached score:", parsed);
        } catch (err) {
          console.error("Error parsing cached score:", err);
        }
      }
      
      // Auto-fetch on initial load
      const lastRefreshKey = `score_refresh_${address.toLowerCase()}`;
      const lastRefresh = localStorage.getItem(lastRefreshKey);
      const canRefresh = !lastRefresh || (Date.now() - parseInt(lastRefresh, 10)) >= (24 * 60 * 60 * 1000);
      
      if (!cachedScore) {
        // No cached data - always fetch (force=true to bypass refresh limit on first load)
        console.log("📊 No cached data - fetching new score (first time)");
        fetchScore(true);
      } else if (canRefresh) {
        // Has cached data but can refresh - fetch in background to update
        console.log("🔄 Has cached data but can refresh - updating in background");
        fetchScore(false);
      } else {
        console.log("⏰ Refresh limit active - using cached score only");
      }
    } else {
      // Reset when disconnected
      setScoreData(null);
      setError(null);
    }
  }, [address, isConnected, fetchScore]);

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
      <div className="max-w-2xl mx-auto">
        <Card variant="elevated">
          <div className="text-center py-8">
            <h2 className="text-3xl font-bold mb-3 gradient-text">Connect Your Wallet</h2>
            <p className="text-gray-400 mb-8 text-lg">
              Connect your MetaMask wallet to view your credit score and start
              borrowing.
            </p>
            <div className="flex justify-center">
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
        <h2 className="text-3xl font-bold mb-8 gradient-text">Dashboard</h2>

        {loading && (
          <div className="p-6 glass rounded-xl border border-gray-800/50">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-300">Loading score...</p>
            </div>
          </div>
        )}
        
        {error && !scoreData && (
          <div className="p-5 bg-red-500/10 border border-red-500/30 rounded-xl backdrop-blur-sm">
            <p className="text-red-400 mb-4 font-medium">Error: {error}</p>
            <button
              onClick={() => fetchScore(true)}
              className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold py-2.5 px-6 rounded-xl transition-all duration-200 shadow-lg shadow-red-500/20"
            >
              Try Again
            </button>
          </div>
        )}
        
        {error && scoreData && (
          <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-yellow-300 text-sm backdrop-blur-sm">
            {error}
          </div>
        )}

        {!scoreData && !loading && !error && (
          <div className="p-6 glass rounded-xl border border-gray-800/50 text-center">
            <p className="text-gray-300 mb-6 text-lg">
              No score data available. Click below to fetch your credit score.
            </p>
            <button
              onClick={() => fetchScore(true)}
              disabled={loading}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-700 disabled:to-gray-700 text-white font-semibold py-3 px-8 rounded-xl transition-all duration-200 shadow-lg shadow-blue-500/25 disabled:shadow-none"
            >
              {loading ? "Loading..." : "🔄 Fetch Score"}
            </button>
          </div>
        )}

        {scoreData && (
          <div>
            {/* Score Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div className="p-6 glass rounded-xl border border-gray-800/50">
                <div className="text-sm text-gray-400 mb-2 font-medium">Credit Score</div>
                <div className="text-4xl font-bold gradient-text">{scoreData.score}</div>
                <div className="text-sm text-gray-500 mt-1">out of 100</div>
              </div>
              <div className="p-6 glass rounded-xl border border-gray-800/50">
                <div className="text-sm text-gray-400 mb-2 font-medium">Credit Tier</div>
                <div className="flex items-center gap-3">
                  <span
                    className={`px-5 py-2.5 rounded-xl text-white font-bold text-lg shadow-lg ${getTierColor(
                      scoreData.tier
                    )}`}
                  >
                    Tier {scoreData.tier}
                  </span>
                  {scoreData.method === "ml" && (
                    <span className="px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg shadow-md">
                      🤖 AI-Powered
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-gray-800/50 pt-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-200">Score Signals</h3>
                <div className="flex items-center gap-3">
                  {!canRefreshScore() && (
                    <span className="text-xs text-gray-500 font-medium">
                      Next refresh: {getNextRefreshTime() || "soon"}
                    </span>
                  )}
                  <button
                    onClick={fetchScore}
                    disabled={loading || !canRefreshScore()}
                    className="text-sm font-semibold text-blue-400 hover:text-blue-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors px-3 py-1.5 rounded-lg hover:bg-blue-500/10 disabled:hover:bg-transparent"
                    title={!canRefreshScore() ? "Score can only be refreshed once per day" : "Refresh your credit score"}
                  >
                    {loading ? "Refreshing..." : "🔄 Refresh"}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="p-4 glass rounded-xl border border-gray-800/50">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm font-medium">Wallet Age</span>
                    <span className="text-lg font-bold text-gray-200">{scoreData.signals.walletAge} days</span>
                  </div>
                </div>
                <div className="p-4 glass rounded-xl border border-gray-800/50">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm font-medium">Recent Transactions</span>
                    <span className="text-lg font-bold text-gray-200">{scoreData.signals.recentTxCount}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Last 30 days</div>
                </div>
                <div className="p-4 glass rounded-xl border border-gray-800/50">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm font-medium">Stablecoin Score</span>
                    <span className="text-lg font-bold text-gray-200">{scoreData.signals.stablecoinHoldingScore}/100</span>
                  </div>
                </div>
                <div className="p-4 glass rounded-xl border border-gray-800/50">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm font-medium">Loan History</span>
                    <span className="text-lg font-bold text-gray-200">{scoreData.signals.loanHistoryScore}/100</span>
                  </div>
                </div>
              </div>
              <div className="mt-6 p-5 glass rounded-xl border border-gray-800/50 text-sm text-gray-400">
                <p className="mb-3 font-semibold text-gray-300">💡 How your score updates:</p>
                <ul className="list-disc list-inside space-y-2 text-xs">
                  <li><strong>Wallet Age:</strong> Increases automatically over time</li>
                  <li><strong>Transaction Count:</strong> Updates when you refresh - counts ALL transactions in last 30 days</li>
                  <li><strong>Stablecoin Holdings:</strong> Reflects your current USDC balance at refresh time</li>
                  <li><strong>Loan History:</strong> Improves when you repay loans - each repaid loan adds +10 points (max +30)</li>
                </ul>
                <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-300 text-xs">
                  <strong>⚠️ Important:</strong> Scores refresh once per day. After taking/repaying loans, 
                  wait 24 hours or check tomorrow to see updated transaction count and loan history reflected in your score.
                </div>
              </div>
            </div>

            <div className="mt-8 p-5 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-xl backdrop-blur-sm">
              <p className="text-sm text-gray-300">
                <strong className="text-blue-400">About Your Tier:</strong> Your credit tier determines your loan-to-value (LTV) limit and annual percentage rate (APR). Higher tiers get better terms.
              </p>
            </div>

            {/* Quick Links */}
            <div className="mt-8 flex gap-4">
              <button
                onClick={() => {
                  window.location.hash = "borrow";
                  setTimeout(() => {
                    window.dispatchEvent(new Event("hashchange"));
                  }, 0);
                }}
                className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 shadow-lg shadow-blue-500/25"
              >
                Open Loan
              </button>
              <button
                onClick={() => {
                  window.location.hash = "positions";
                  setTimeout(() => {
                    window.dispatchEvent(new Event("hashchange"));
                  }, 0);
                }}
                className="flex-1 bg-gray-800/60 hover:bg-gray-800/80 border border-gray-700/50 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200"
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

