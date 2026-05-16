import { Injectable, Logger } from '@nestjs/common';
import { correlationStorage } from './correlation-id.context';

export type CategoryEventType =
  | 'category.create'
  | 'category.update'
  | 'category.delete'
  | 'category.reorder';

export type CategoryEventOutcome =
  | 'success'
  | 'validation_rejected'
  | 'not_found'
  | 'role_refused';

export interface CategoryEventInput {
  event: CategoryEventType;
  outcome: CategoryEventOutcome;
  actorId?: string;
  categoryId?: string;
  itemsCount?: number;
  sourceIp?: string;
}

/**
 * Emits one structured JSON line per category-mutation event (FR-038).
 */
@Injectable()
export class CategoryEventLogger {
  private readonly log = new Logger('CategoryEvent');

  emit(input: CategoryEventInput) {
    const store = correlationStorage.getStore();
    const payload = {
      event: input.event,
      outcome: input.outcome,
      actorId: input.actorId ?? null,
      categoryId: input.categoryId ?? null,
      itemsCount: input.itemsCount ?? null,
      sourceIp: store?.sourceIp ?? input.sourceIp ?? 'unknown',
      correlationId: store?.correlationId ?? 'unknown',
      timestamp: new Date().toISOString(),
    };
    this.log.log(JSON.stringify(payload));
  }

  createSuccess({ actorAdminId, categoryId, sourceIp }: { actorAdminId: string; categoryId: string; sourceIp: string }) {
    this.emit({ event: 'category.create', outcome: 'success', actorId: actorAdminId, categoryId, sourceIp });
  }
  createValidationRejected({ actorAdminId, sourceIp }: { actorAdminId: string; sourceIp: string }) {
    this.emit({ event: 'category.create', outcome: 'validation_rejected', actorId: actorAdminId, sourceIp });
  }
  updateSuccess({ actorAdminId, categoryId, sourceIp }: { actorAdminId: string; categoryId: string; sourceIp: string }) {
    this.emit({ event: 'category.update', outcome: 'success', actorId: actorAdminId, categoryId, sourceIp });
  }
  updateValidationRejected({ actorAdminId, sourceIp }: { actorAdminId: string; sourceIp: string }) {
    this.emit({ event: 'category.update', outcome: 'validation_rejected', actorId: actorAdminId, sourceIp });
  }
  updateNotFound({ actorAdminId, sourceIp }: { actorAdminId: string; sourceIp: string }) {
    this.emit({ event: 'category.update', outcome: 'not_found', actorId: actorAdminId, sourceIp });
  }
  deleteSuccess({ actorAdminId, categoryId, sourceIp }: { actorAdminId: string; categoryId: string; sourceIp: string }) {
    this.emit({ event: 'category.delete', outcome: 'success', actorId: actorAdminId, categoryId, sourceIp });
  }
  deleteNotFound({ actorAdminId, sourceIp }: { actorAdminId: string; sourceIp: string }) {
    this.emit({ event: 'category.delete', outcome: 'not_found', actorId: actorAdminId, sourceIp });
  }
  reorderSuccess({ actorAdminId, itemsCount, sourceIp }: { actorAdminId: string; itemsCount: number; sourceIp: string }) {
    this.emit({ event: 'category.reorder', outcome: 'success', actorId: actorAdminId, itemsCount, sourceIp });
  }
  reorderValidationRejected({ actorAdminId, sourceIp }: { actorAdminId: string; sourceIp: string }) {
    this.emit({ event: 'category.reorder', outcome: 'validation_rejected', actorId: actorAdminId, sourceIp });
  }
  roleRefused({ actorUserId, sourceIp }: { actorUserId: string; sourceIp: string }) {
    this.emit({ event: 'category.create', outcome: 'role_refused', actorId: actorUserId, sourceIp });
  }
}
