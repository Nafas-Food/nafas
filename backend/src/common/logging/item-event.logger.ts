import { Injectable, Logger } from '@nestjs/common';
import { CorrelationIdContext } from './correlation-id.context';

export type ItemEventName =
  | 'item.create'
  | 'item.update'
  | 'item.soft_delete'
  | 'item.active_toggle'
  | 'item.reorder'
  | 'item.image_upload'
  | 'item.image_remove';

export type ItemEventOutcome =
  | 'success'
  | 'validation_rejected'
  | 'negative_effective_price'
  | 'images_full'
  | 'unsupported_media_type'
  | 'payload_too_large'
  | 'rate_limited'
  | 'reorder_not_exact_set'
  | 'not_found'
  | 'role_refused';

interface ItemEventInput {
  event: ItemEventName;
  outcome: ItemEventOutcome;
  actorUserId: string | null;
  actorRole: 'admin' | 'customer' | 'chef' | null;
  sourceIp: string | null;
  targetItemId?: string;
}

@Injectable()
export class ItemEventLogger {
  private readonly logger = new Logger('ItemEvent');

  constructor(private readonly correlationContext: CorrelationIdContext) {}

  emit(input: ItemEventInput): void {
    const line = {
      event: input.event,
      outcome: input.outcome,
      actor: { userId: input.actorUserId, role: input.actorRole },
      sourceIp: input.sourceIp,
      target: input.targetItemId ? { itemId: input.targetItemId } : undefined,
      correlationId: this.correlationContext.get() ?? null,
      timestamp: new Date().toISOString(),
    };
    this.logger.log(JSON.stringify(line));
  }
}
