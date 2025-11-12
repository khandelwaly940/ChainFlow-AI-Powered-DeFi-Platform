import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { defineChain } from "viem";

// Custom Hardhat local network (Chain ID 31337)
const hardhatLocal = defineChain({
  id: 31337,
  name: "Hardhat Local",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: ["http://127.0.0.1:8545"],
    },
  },
  blockExplorers: {
    default: {
      name: "Local",
      url: "http://localhost:8545",
    },
  },
});

export const chains = [hardhatLocal] as const;

export const config = getDefaultConfig({
  appName: "ChainFlow",
  projectId: "6926a690c050565996b5298b2a3dcdf7", // Get from https://cloud.walletconnect.com
  chains,
  ssr: false,
});

