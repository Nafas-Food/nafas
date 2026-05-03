import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface AdminContextStore {
  includeDeleted: boolean;
}

@Injectable()
export class AdminContextService {
  private readonly als = new AsyncLocalStorage<AdminContextStore>();

  run<T>(store: AdminContextStore, callback: () => T): T {
    return this.als.run(store, callback);
  }

  getStore(): AdminContextStore | undefined {
    return this.als.getStore();
  }
}
