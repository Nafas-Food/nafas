import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { AdminContextService } from '../admin-context/admin-context.service';

const SOFT_DELETE_MODELS = new Set([
  'User',
  'UserAddress',
  'Chef',
  'Category',
  'Menu',
  'Item',
  'Order',
  'UserReview',
  'Transaction',
]);

type ExtendedClient = ReturnType<typeof buildExtended>;

function buildExtended(base: PrismaClient, adminContext: AdminContextService) {
  return base.$extends({
    query: {
      $allModels: {
        async findMany({ model, args, query }) {
          if (
            SOFT_DELETE_MODELS.has(model) &&
            !adminContext.getStore()?.includeDeleted
          ) {
            args.where = { ...(args.where ?? {}), deletedAt: null };
          }
          return query(args);
        },
        async findFirst({ model, args, query }) {
          if (
            SOFT_DELETE_MODELS.has(model) &&
            !adminContext.getStore()?.includeDeleted
          ) {
            args.where = { ...(args.where ?? {}), deletedAt: null };
          }
          return query(args);
        },
        async findUnique({ model, args, query }) {
          const result = await query(args);
          if (
            SOFT_DELETE_MODELS.has(model) &&
            !adminContext.getStore()?.includeDeleted &&
            result &&
            (result as { deletedAt?: Date | null }).deletedAt !== null
          ) {
            return null as never;
          }
          return result;
        },
        async count({ model, args, query }) {
          if (
            SOFT_DELETE_MODELS.has(model) &&
            !adminContext.getStore()?.includeDeleted
          ) {
            args.where = { ...(args.where ?? {}), deletedAt: null };
          }
          return query(args);
        },
        async aggregate({ model, args, query }) {
          if (
            SOFT_DELETE_MODELS.has(model) &&
            !adminContext.getStore()?.includeDeleted
          ) {
            args.where = { ...(args.where ?? {}), deletedAt: null };
          }
          return query(args);
        },
      },
    },
    model: {
      $allModels: {
        async softDelete<T>(this: T, where: unknown): Promise<unknown> {
          const ctx = Prisma.getExtensionContext(this) as unknown as {
            update: (args: { where: unknown; data: { deletedAt: Date } }) => Promise<unknown>;
            name: string;
          };
          if (!SOFT_DELETE_MODELS.has(ctx.name)) {
            throw new Error(
              `softDelete() called on non-soft-delete model: ${ctx.name}`,
            );
          }
          return ctx.update({ where, data: { deletedAt: new Date() } });
        },
      },
    },
  });
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  public readonly extended: ExtendedClient;

  constructor(private readonly adminContext: AdminContextService) {
    super();
    this.extended = buildExtended(this, adminContext);
    return new Proxy(this, {
      get: (target, prop) => {
        if (prop === 'extended') return target.extended;
        if (prop === '$connect') return target.$connect.bind(target);
        if (prop === '$disconnect') return target.$disconnect.bind(target);
        if (prop === '$queryRaw') return target.$queryRaw.bind(target);
        if (prop === 'onModuleInit') return target.onModuleInit.bind(target);
        if (prop === 'onModuleDestroy') return target.onModuleDestroy.bind(target);
        if (prop === 'logger') return target.logger;
        if (typeof prop === 'string' && prop.startsWith('$')) {
          return (target as any)[prop];
        }
        const ext = (target.extended as any)[prop as string];
        if (ext !== undefined) return ext;
        return (target as any)[prop];
      },
    }) as any;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma connected (soft-delete extension active)');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Prisma disconnected');
  }
}
