import 'server-only';

// Shared managed-coin helpers used by the admin coin routes.

export const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

interface NetIn { code?: unknown; contractAddress?: unknown; decimals?: unknown; depositEnabled?: unknown; withdrawEnabled?: unknown }

export interface CoinNetwork { code: string; contractAddress: string; decimals: number; depositEnabled: boolean; withdrawEnabled: boolean }

// Validate + normalize the networks array. Each EVM network needs a valid
// contract address (0x + 40 hex) and decimals (0–36). depositEnabled /
// withdrawEnabled gate whether the network is offered on the user deposit /
// withdraw screens — both default to true so existing coins keep working, and
// an admin can turn off a network the hub can't actually service.
export function parseNetworks(raw: unknown): CoinNetwork[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw Object.assign(new Error('Add at least one network with a contract address'), { status: 400 });
  }
  return raw.map((n: NetIn, i) => {
    const code = String(n.code ?? '').trim().toUpperCase();
    const contractAddress = String(n.contractAddress ?? '').trim();
    const decimals = Number(n.decimals);
    if (!code) throw Object.assign(new Error(`Network #${i + 1}: network is required`), { status: 400 });
    if (!EVM_ADDRESS.test(contractAddress)) {
      throw Object.assign(new Error(`Network ${code}: contract address must be 0x followed by 40 hex characters`), { status: 400 });
    }
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
      throw Object.assign(new Error(`Network ${code}: decimals must be a whole number between 0 and 36`), { status: 400 });
    }
    // Default true: only an explicit `false` disables a network.
    const depositEnabled = n.depositEnabled !== false;
    const withdrawEnabled = n.withdrawEnabled !== false;
    return { code, contractAddress, decimals, depositEnabled, withdrawEnabled };
  });
}
