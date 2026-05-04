import { AsyncLocalStorage } from 'async_hooks';

export interface CorrelationStore {
  correlationId: string;
  sourceIp: string;
}

/**
 * Per-request scope used by the auth-event logger and any future
 * cross-cutting code that needs the request ID. Set by
 * CorrelationIdMiddleware. Read by AuthEventLogger.
 *
 * This is the same primitive Phase 0 used for AdminContextService —
 * one AsyncLocalStorage instance per concern, by design.
 */
export const correlationStorage = new AsyncLocalStorage<CorrelationStore>();