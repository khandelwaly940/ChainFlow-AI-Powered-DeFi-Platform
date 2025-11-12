// Contract ABIs (proper format for wagmi/viem)
export const LENDING_CORE_ABI = [
  {
    inputs: [
      { name: "collateralAmount", type: "uint256" },
      { name: "desiredDebt", type: "uint256" }
    ],
    name: "openLoan",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "loanId", type: "uint256" },
      { name: "repayAmount", type: "uint256" }
    ],
    name: "repay",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "loanId", type: "uint256" }],
    name: "healthFactor",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { name: "loanId", type: "uint256" },
      { name: "maxRepay", type: "uint256" }
    ],
    name: "liquidate",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ name: "", type: "uint256" }],
    name: "loans",
    outputs: [
      { name: "borrower", type: "address" },
      { name: "collateralToken", type: "address" },
      { name: "debtToken", type: "address" },
      { name: "collateralAmount", type: "uint256" },
      { name: "debtAmount", type: "uint256" },
      { name: "interestRate", type: "uint256" },
      { name: "createdAt", type: "uint256" },
      { name: "lastAccruedAt", type: "uint256" },
      { name: "active", type: "bool" }
    ],
    stateMutability: "view",
    type: "function"
  }
] as const;

export const SCORE_REGISTRY_ABI = [
  {
    inputs: [{ name: "user", type: "address" }],
    name: "getTier",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "user", type: "address" }],
    name: "getScore",
    outputs: [
      { name: "scoreHash", type: "bytes32" },
      { name: "tier", type: "uint8" }
    ],
    stateMutability: "view",
    type: "function"
  }
] as const;

// ERC20 ABI for approvals
export const ERC20_ABI = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

// Helper function to validate address format
export function isValidAddress(address: string | undefined): address is `0x${string}` {
  if (!address) return false;
  return typeof address === 'string' && 
         address.startsWith('0x') && 
         address.length === 42 && 
         /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Get and validate addresses from environment
const getEnvAddress = (key: string): `0x${string}` | undefined => {
  const value = import.meta.env[key];
  if (!value) {
    console.warn(`⚠️ ${key} is not set in .env.local`);
    return undefined;
  }
  if (!isValidAddress(value)) {
    console.error(`❌ ${key} has invalid format: ${value}`);
    return undefined;
  }
  return value as `0x${string}`;
};

// Contract addresses from environment (validated)
export const CORE_ADDRESS = getEnvAddress('VITE_CORE_ADDRESS');
export const SCORE_ADDRESS = getEnvAddress('VITE_SCORE_ADDRESS');
export const WMATIC_ADDRESS = getEnvAddress('VITE_WMATIC_ADDRESS');
export const USDC_ADDRESS = getEnvAddress('VITE_USDC_ADDRESS');

// Log configured addresses on module load
if (typeof window !== 'undefined') {
  console.log('📋 Contract Addresses Configuration:');
  console.log('  CORE_ADDRESS:', CORE_ADDRESS || '❌ NOT SET');
  console.log('  SCORE_ADDRESS:', SCORE_ADDRESS || '❌ NOT SET');
  console.log('  WMATIC_ADDRESS:', WMATIC_ADDRESS || '❌ NOT SET');
  console.log('  USDC_ADDRESS:', USDC_ADDRESS || '❌ NOT SET');
}

