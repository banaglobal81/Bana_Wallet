// Client helper for admin-managed coins shown to users.

export interface ManagedCoinNetwork {
  code: string;
  contractAddress: string;
  decimals: number;
  // Optional for backward-compat with coins saved before these flags existed;
  // absent is treated as enabled (only an explicit false disables the network).
  depositEnabled?: boolean;
  withdrawEnabled?: boolean;
}

export interface UserManagedCoin {
  symbol: string;
  name: string;
  networks: ManagedCoinNetwork[];
  logoKey: string | null;
}

/** Visible admin-managed coins (custom EVM tokens), merged into the coin list. */
export async function getManagedCoins(): Promise<UserManagedCoin[]> {
  try {
    const res = await fetch('/api/coins', { headers: { Accept: 'application/json' } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.ok === false) return [];
    return Array.isArray(body.data) ? body.data : [];
  } catch {
    return [];
  }
}
