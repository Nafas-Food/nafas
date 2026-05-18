import { Injectable, Logger } from '@nestjs/common';
import { CorrelationIdContext } from './correlation-id.context';

export type MenuEventName =
  | 'menu.create'
  | 'menu.update'
  | 'menu.soft_delete'
  | 'menu.reorder'
  | 'menu.availability_add'
  | 'menu.availability_remove';

export type MenuEventOutcome =
  | 'success'
  | 'validation_rejected'
  | 'category_not_found'
  | 'reorder_not_exact_set'
  | 'not_found'
  | 'role_refused'
  | 'rate_limited';

interface MenuEventInput {
  event: MenuEventName;
  outcome: MenuEventOutcome;
  actorUserId: string | null;
  actorRole: 'admin' | 'customer' | 'chef' | null;
  sourceIp: string | null;
  targetMenuId?: string;
}

@Injectable()
export class MenuEventLogger {
  private readonly logger = new Logger('MenuEvent');

  constructor(private readonly correlationContext: CorrelationIdContext) {}

  emit(input: MenuEventInput): void {
    const line = {
      event: input.event,
      outcome: input.outcome,
      actor: { userId: input.actorUserId, role: input.actorRole },
      sourceIp: input.sourceIp,
      target: input.targetMenuId ? { menuId: input.targetMenuId } : undefined,
      correlationId: this.correlationContext.get() ?? null,
      timestamp: new Date().toISOString(),
    };
    this.logger.log(JSON.stringify(line));
  }
}
