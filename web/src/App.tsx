import { useState, useEffect, useRef } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useChainId, useAccount, useConnect, useSwitchChain } from "wagmi";
import { Dashboard } from "./pages/Dashboard";
import { Borrow } from "./pages/Borrow";
import { Positions } from "./pages/Positions";

type Tab = "dashboard" | "borrow" | "positions";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const chainId = useChainId();
  const { isConnected, isConnecting, isDisconnected, address } = useAccount();
  const { connectors } = useConnect();
  const { switchChain } = useSwitchChain();
  const prevChainIdRef = useRef<number | null>(null);
  const connectionLostRef = useRef(false);
  
  const getNetworkName = () => {
    if (chainId === 80002) return "Polygon Amoy";
    if (chainId === 31337) return "Local";
    return "Unknown";
  };

  // Handle hash navigation - listen for changes
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      console.log("Hash changed to:", hash);
      if (hash === "borrow" || hash === "positions" || hash === "dashboard") {
        console.log("Setting active tab to:", hash);
        setActiveTab(hash as Tab);
      } else if (!hash) {
        // Default to dashboard if no hash
        setActiveTab("dashboard");
      }
    };

    // Check initial hash
    handleHashChange();

    // Listen for hash changes
    window.addEventListener("hashchange", handleHashChange);
    
    // Also listen for popstate (back/forward button)
    window.addEventListener("popstate", handleHashChange);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      window.removeEventListener("popstate", handleHashChange);
    };
  }, []);

  // Monitor connection status and prevent disconnections
  useEffect(() => {
    // Track chain ID changes
    if (prevChainIdRef.current !== null && prevChainIdRef.current !== chainId && isConnected) {
      console.warn("Chain ID changed:", { from: prevChainIdRef.current, to: chainId });
      // If chain ID changes unexpectedly, try to switch back to local
      if (chainId !== 31337 && prevChainIdRef.current === 31337) {
        console.log("Attempting to switch back to local network...");
        try {
          switchChain({ chainId: 31337 });
        } catch (err) {
          console.error("Failed to switch chain:", err);
        }
      }
    }
    prevChainIdRef.current = chainId;

    // Log connection status changes
    if (isConnected || isDisconnected) {
      if (isDisconnected && connectionLostRef.current === false) {
        console.warn("⚠️ Wallet disconnected!");
        connectionLostRef.current = true;
      } else if (isConnected && connectionLostRef.current === true) {
        console.log("✅ Wallet reconnected!");
        connectionLostRef.current = false;
      }
      console.log("Connection status:", { isConnected, isConnecting, isDisconnected, chainId, address });
    }
  }, [isConnected, isDisconnected, chainId, address, switchChain]);

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    window.location.hash = tab;
  };

  return (
    <div className="min-h-screen">
      <nav className="glass-strong border-b border-gray-800/50 sticky top-0 z-50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold gradient-text">ChainFlow</h1>
              <span className="px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-blue-300 rounded-full border border-blue-500/30 backdrop-blur-sm">
                {getNetworkName()}
              </span>
            </div>
            <ConnectButton />
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex gap-1 mb-10 p-1 glass rounded-2xl border border-gray-800/50 w-fit">
          <button
            onClick={() => handleTabChange("dashboard")}
            className={`px-6 py-2.5 font-semibold text-sm rounded-xl transition-all duration-200 ${
              activeTab === "dashboard"
                ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/25"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => handleTabChange("borrow")}
            className={`px-6 py-2.5 font-semibold text-sm rounded-xl transition-all duration-200 ${
              activeTab === "borrow"
                ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/25"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
            }`}
          >
            Borrow
          </button>
          <button
            onClick={() => handleTabChange("positions")}
            className={`px-6 py-2.5 font-semibold text-sm rounded-xl transition-all duration-200 ${
              activeTab === "positions"
                ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/25"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
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

