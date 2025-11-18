import React, { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import "./index.css";
import App from "./App";
import { config } from "./lib/wagmi";

// Create QueryClient with persistence settings
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false, // Don't refetch on reconnect to avoid spam
      retry: (failureCount, error: any) => {
        // Don't retry on contract revert errors (they won't succeed on retry)
        if (error?.message?.includes("revert") || error?.message?.includes("reverted")) {
          return false;
        }
        // Only retry once for other errors
        return failureCount < 1;
      },
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchInterval: false, // Disable automatic polling by default
    },
  },
});

// Error boundary to prevent crashes from disconnecting wallet
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
    // Don't disconnect wallet on errors - just log them
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center">
          <div className="text-center max-w-md">
            <h2 className="text-2xl font-bold text-red-400 mb-4">Something went wrong</h2>
            <p className="text-gray-400 mb-4">
              An error occurred, but your wallet connection is safe. You can reload the page to continue.
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Disable StrictMode in development to prevent double renders that can cause wallet disconnections
// StrictMode intentionally double-invokes functions in development, which can interfere with wallet connections
const isDevelopment = import.meta.env.DEV;
const AppWrapper = isDevelopment ? App : () => <StrictMode><App /></StrictMode>;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          {isDevelopment ? <App /> : <StrictMode><App /></StrictMode>}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </ErrorBoundary>
);

