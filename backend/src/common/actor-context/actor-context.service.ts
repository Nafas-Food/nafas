import { AsyncLocalStorage } from 'async_hooks';
import { Injectable } from '@nestjs/common';

interface ActorStore {
  userId: string | null;
  sourceIp: string | null;
}

/**
 * ALS-backed helper to read the current request's JWT sub + source IP
 * from anywhere in the call stack without threading them through every
 * method signature. Set by controllers at request-entry; consumed by
 * services for structured logging.
 */
@Injectable()
export class ActorContext {
  private readonly als = new AsyncLocalStorage<ActorStore>();

  run<T>(userId: string | null, sourceIp: string | null, callback: () => T): T {
    return this.als.run({ userId, sourceIp }, callback);
  }

  getUserId(): string | null {
    return this.als.getStore()?.userId ?? null;
  }

  getSourceIp(): string | null {
    return this.als.getStore()?.sourceIp ?? null;
  }
}
