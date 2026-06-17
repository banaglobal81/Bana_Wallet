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
  webhookEvents: WebhookEvent[];
  webhookEventSeq: number;
}

// Singleton that survives Next.js dev hot-reload by anchoring to globalThis.
// In production each worker process has its own singleton (stateless between
// deployments — no external store required for the dedup guard).
const g = globalThis as unknown as { __niaState?: NiaState };
export const niaState: NiaState = g.__niaState ?? (g.__niaState = {
  inFlightWithdrawals: new Set<string>(),
  webhookEvents: [],
  webhookEventSeq: 0,
});
