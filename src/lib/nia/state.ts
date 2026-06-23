import 'server-only';

// Maximum number of webhook events kept in the ring buffer.
export const WEBHOOK_EVENTS_MAX = 100;

export interface WebhookEvent {
  id: number;
  ts: number;
  type: string;
  userId: string | null;
  data: unknown;
}

interface NiaState {
  inFlightWithdrawals: Set<string>;
  inFlightAddresses: Set<string>;
  webhookEvents: WebhookEvent[];
  webhookEventSeq: number;
}

// Singleton that survives Next.js dev hot-reload by anchoring to globalThis.
// In production each worker process has its own singleton (stateless between
// deployments — no external store required for the dedup guard).
const g = globalThis as unknown as { __niaState?: Partial<NiaState> };
const s: Partial<NiaState> = g.__niaState ?? (g.__niaState = {});

// Backfill each field if absent. Using ??= (not a fresh-object initializer) means
// fields added later are populated even on a singleton created by an earlier build
// still live in a long-running/hot-reloaded process — never leaving one undefined.
s.inFlightWithdrawals ??= new Set<string>();
s.inFlightAddresses ??= new Set<string>();
s.webhookEvents ??= [];
s.webhookEventSeq ??= 0;

export const niaState: NiaState = s as NiaState;
