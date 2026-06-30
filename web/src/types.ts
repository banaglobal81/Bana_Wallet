export type Screen =
  | 'PORTFOLIO_DASHBOARD'
  | 'TRANSACTION_SIMULATION'
  | 'SETTINGS_INTERFACE'
  | 'ACTIVITY_HISTORY'
  | 'SWAP_INTERFACE'
  | 'STAKING_INTERFACE'
  | 'WALLET_INTERFACE'
  | 'DEPOSIT_INTERFACE'
  | 'WITHDRAW_INTERFACE'
  | 'SCAM_WARNING_MODAL';

export interface Asset {
  id: string;
  name: string;
  symbol: string;
  chain: string;
  price: number;
  change24h: number;
  holdings: number;
  value: number;
  icon: string;
}

export interface Activity {
  id: string;
  type: 'Swap' | 'Send' | 'Receive' | 'Approve';
  title: string;
  description: string;
  fromAmount: string;
  fromSymbol: string;
  toAmount: string;
  toSymbol: string;
  timestamp: string;
  status: 'Completed' | 'Pending' | 'Rejected' | 'Failed';
  txHash: string;
  gasFee: string;
}

export interface SystemSettings {
  mevProtection: boolean;
  selectedSlippage: '0.1' | '0.5' | '1.0' | 'custom';
  customSlippage: string;
  networkGas: 'Standard' | 'Fast' | 'Instant';
  rpcUrl: string;
  connectedWallet: string;
  walletConnected: boolean;
  activeChain: 'Mainnet' | 'Base' | 'Arbitrum';
}
