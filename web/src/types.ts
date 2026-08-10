export type Screen =
  | 'PORTFOLIO_DASHBOARD'
  | 'SETTINGS_INTERFACE'
  | 'ACTIVITY_HISTORY'
  | 'SWAP_INTERFACE'
  | 'STAKING_INTERFACE'
  | 'WALLET_INTERFACE'
  | 'DEPOSIT_INTERFACE'
  | 'WITHDRAW_INTERFACE'
  | 'REFERRAL_INTERFACE';

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
  // 'AwaitingOnchain' — V2-CORE LOCAL-rail withdrawal, approved but not yet
  // sent on-chain (WithdrawalStatus.AWAITING_ONCHAIN). Deliberately distinct
  // from 'Completed' — nothing has moved yet (A-7 §5.4/LA-5).
  status: 'Completed' | 'Pending' | 'AwaitingOnchain' | 'Rejected' | 'Failed';
  txHash: string;
}

// Client-side display preferences only. Anything touching real funds (balances,
// trades, transfers) is server-side via Nia-Hub — never a client setting.
export interface SystemSettings {
  activeChain: 'Mainnet' | 'Base' | 'Arbitrum';
}
