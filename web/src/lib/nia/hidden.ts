// Product decision: hub-listed coins in this set are hidden from users (markets list + deposit address).
// Exact symbol match only (case-insensitive) — never by prefix: "VNX" is hidden, "VNXT" stays visible.
export const HIDDEN_HUB_SYMBOLS: ReadonlySet<string> = new Set(['VNX']);

export function isHiddenHubSymbol(symbol: unknown): boolean {
  return typeof symbol === 'string' && HIDDEN_HUB_SYMBOLS.has(symbol.trim().toUpperCase());
}

/**
 * Remove hidden coins from a /api/v1/markets response.
 * - `currencies[]` entries whose symbol is hidden are dropped.
 * - `markets[]` entries whose baseAsset or quoteAsset is hidden are dropped.
 * Defensive: non-object payloads and missing/non-array fields pass through unchanged.
 */
export function filterHiddenMarkets<T>(data: T): T {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const src = data as Record<string, unknown>;
  const out: Record<string, unknown> = { ...src };

  if (Array.isArray(src.currencies)) {
    out.currencies = src.currencies.filter((c) => {
      const sym = c && typeof c === 'object'
        ? ((c as Record<string, unknown>).symbol ?? (c as Record<string, unknown>).currency)
        : undefined;
      return !isHiddenHubSymbol(sym);
    });
  }
  if (Array.isArray(src.markets)) {
    out.markets = src.markets.filter((m) => {
      if (!m || typeof m !== 'object') return true;
      const r = m as Record<string, unknown>;
      return !isHiddenHubSymbol(r.baseAsset) && !isHiddenHubSymbol(r.quoteAsset);
    });
  }
  return out as T;
}
