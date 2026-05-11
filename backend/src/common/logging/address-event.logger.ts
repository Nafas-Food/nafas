import { Injectable, Logger } from '@nestjs/common';
import { correlationStorage } from './correlation-id.context';

export type AddressEventType =
  | 'address.create'
  | 'address.update'
  | 'address.delete';

export type AddressEventOutcome =
  | 'success'
  | 'validation_rejected'
  | 'not_found'
  | 'in_use';

export interface AddressEventInput {
  event: AddressEventType;
  outcome: AddressEventOutcome;
  actorId?: string;
  addressId?: string;
  extra?: Record<string, string | number | boolean | null>;
}

/**
 * Emits one structured JSON line per address-mutation event (FR-019).
 * Per FR-021 / SC-011 the line MUST NEVER carry latitude, longitude,
 * or any coordinate-derived value. The `extra` field is typed as
 * primitive scalars only; never pass an object containing
 * coordinates.
 */
@Injectable()
export class AddressEventLogger {
  private readonly log = new Logger('AddressEvent');

  emit(input: AddressEventInput) {
    const store = correlationStorage.getStore();
    const payload = {
      event: input.event,
      outcome: input.outcome,
      actorId: input.actorId ?? null,
      addressId: input.addressId ?? null,
      sourceIp: store?.sourceIp ?? 'unknown',
      correlationId: store?.correlationId ?? 'unknown',
      timestamp: new Date().toISOString(),
      ...(input.extra ?? {}),
    };
    this.log.log(JSON.stringify(payload));
  }
}
