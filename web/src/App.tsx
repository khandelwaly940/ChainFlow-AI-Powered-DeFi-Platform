import { useState, useEffect } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useChainId, useAccount, useConnect } from "wagmi";
import { Dashboard } from "./pages/Dashboard";
import { Borrow } from "./pages/Borrow";
import { Positions } from "./pages/Positions";

type Tab = "dashboard" | "borrow" | "positions";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const chainId = useChainId();
  const { isConnected, isConnecting, isDisconnected } = useAccount();
  const { connectors } = useConnect();
  
  const getNetworkName = () => {
    if (chainId === 80002) return "Polygon Amoy";
    if (chainId === 31337) return "Local";
    return "Unknown";
  };

  // Handle hash navigation
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash === "borrow" || hash === "positions" || hash === "dashboard") {
      setActiveTab(hash as Tab);
    }
  }, []);

  // Log connection status for debugging
  useEffect(() => {
    console.log("Connection status:", { isConnected, isConnecting, isDisconnected, chainId });
  }, [isConnected, isConnecting, isDisconnected, chainId]);

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    window.location.hash = tab;
  };

  return (
    <div className="min-h-screen bg-gray-950">
      <nav className="border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold">ChainFlow</h1>
              <span className="px-3 py-1 text-xs font-medium bg-gray-800 text-gray-300 rounded-full border border-gray-700">
                {getNetworkName()}
              </span>
            </div>
            <ConnectButton />
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-2 mb-8 border-b border-gray-800">
          <button
            onClick={() => handleTabChange("dashboard")}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === "dashboard"
                ? "text-blue-400 border-b-2 border-blue-400"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => handleTabChange("borrow")}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === "borrow"
                ? "text-blue-400 border-b-2 border-blue-400"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            Borrow
          </button>
          <button
            onClick={() => handleTabChange("positions")}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === "positions"
                ? "text-blue-400 border-b-2 border-blue-400"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            Positions
          </button>
        </div>

        {activeTab === "dashboard" && <Dashboard />}
        {activeTab === "borrow" && <Borrow />}
        {activeTab === "positions" && <Positions />}
      </div>
    </div>
  );
}

export default App;

