import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthEventLogger } from '../logging/auth-event.logger';
import { AddressEventLogger } from '../logging/address-event.logger';
import { ChefEventLogger } from '../logging/chef-event.logger';
import { CategoryEventLogger } from '../logging/category-event.logger';
import { MenuEventLogger, MenuEventName } from '../logging/menu-event.logger';
import { ItemEventLogger, ItemEventName } from '../logging/item-event.logger';

interface NormalizedError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  activeOrderId?: string;
}

@Catch(HttpException)
export class HttpExceptionNormalizerFilter implements ExceptionFilter {
  constructor(
    private readonly authEvents: AuthEventLogger,
    private readonly addressEvents: AddressEventLogger,
    private readonly chefEvents: ChefEventLogger,
    private readonly categoryEvents: CategoryEventLogger,
    private readonly menuEvents: MenuEventLogger,
    private readonly itemEvents: ItemEventLogger,
  ) {}

  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const raw = exception.getResponse();

    const normalized = this.normalize(exception, status, raw);
    this.scrubCoordinates(normalized as unknown as Record<string, unknown>);

    if (exception instanceof ThrottlerException) {
      this.authEvents.emit({
        event: 'auth.rate_limit',
        outcome: 'tripped',
        extra: { path: req.url, method: req.method },
      });
    } else if (
      normalized.code === 'VALIDATION_ERROR' &&
      Array.isArray(normalized.details?.fields)
    ) {
      const passwordTooShort = (normalized.details!.fields as string[]).some(
        (m) => /password/i.test(m) && /(short|longer|at least|min)/i.test(m),
      );
      if (passwordTooShort) {
        this.authEvents.emit({
          event: 'auth.password_validation',
          outcome: 'too_short',
        });
      }
    }

    if (req.url?.startsWith('/api/v1/addresses')) {
      const method = req.method;
      const event =
        method === 'POST'
          ? 'address.create'
          : method === 'PATCH'
            ? 'address.update'
            : method === 'DELETE'
              ? 'address.delete'
              : null;
      if (event) {
        const outcome =
          normalized.code === 'VALIDATION_ERROR'
            ? ('validation_rejected' as const)
            : status === HttpStatus.NOT_FOUND
              ? ('not_found' as const)
              : null;
        if (outcome) {
          const userSub = (req as Request & { user?: { sub?: string } }).user
            ?.sub;
          const segs = req.url.split('?')[0].split('/');
          const addressId = segs.length >= 5 ? segs[4] : undefined;
          this.addressEvents.emit({
            event,
            outcome,
            actorId: userSub,
            addressId,
          });
        }
      }
    }

    if (
      req.url?.startsWith('/api/v1/chefs') ||
      req.url?.startsWith('/api/v1/chef') ||
      req.url?.startsWith('/api/v1/admin/chefs') ||
      req.url?.startsWith('/api/v1/home')
    ) {
      this.scrubCoordinates(normalized as unknown as Record<string, unknown>);
    }

    // Chef validation rejections — use pathname so query strings don't break matching
    if (normalized.code === 'VALIDATION_ERROR') {
      const path =
        (req as Request & { path?: string }).path ??
        req.url?.split('?')[0] ??
        '';
      const userSub = (req as Request & { user?: { sub?: string } }).user?.sub;
      if (path === '/api/v1/chef/apply') {
        this.chefEvents.applyValidationRejected({
          actorUserId: userSub ?? 'unknown',
          sourceIp: req.ip ?? 'unknown',
        });
      }
      if (path === '/api/v1/chef/profile') {
        this.chefEvents.profileUpdateValidationRejected({
          actorChefId: userSub ?? 'unknown',
          sourceIp: req.ip ?? 'unknown',
        });
      }
      if (path === '/api/v1/chef/availability') {
        this.chefEvents.availabilityValidationRejected({
          actorChefId: userSub ?? 'unknown',
          sourceIp: req.ip ?? 'unknown',
        });
      }
    }

    // Chef not-found (findOwnedOrThrow) — use pathname
    if (status === HttpStatus.NOT_FOUND) {
      const path =
        (req as Request & { path?: string }).path ??
        req.url?.split('?')[0] ??
        '';
      const userSub = (req as Request & { user?: { sub?: string } }).user?.sub;
      if (path === '/api/v1/chef/profile') {
        this.chefEvents.profileUpdateNotFound({
          actorChefId: userSub ?? 'unknown',
          sourceIp: req.ip ?? 'unknown',
        });
      }
      if (path === '/api/v1/chef/availability') {
        this.chefEvents.availabilityToggleNotFound({
          actorChefId: userSub ?? 'unknown',
          sourceIp: req.ip ?? 'unknown',
        });
      }
    }

    // Category validation rejections + not-found + role refused — use pathname
    if (req.url?.startsWith('/api/v1/admin/categories')) {
      const path =
        (req as Request & { path?: string }).path ??
        req.url?.split('?')[0] ??
        '';
      const userSub = (req as Request & { user?: { sub?: string } }).user?.sub;
      const method = req.method;
      if (normalized.code === 'VALIDATION_ERROR') {
        const event =
          method === 'POST'
            ? 'category.create'
            : method === 'PATCH' && !path.endsWith('/reorder')
              ? 'category.update'
              : method === 'PATCH' && path.endsWith('/reorder')
                ? 'category.reorder'
                : null;
        if (event === 'category.create') {
          this.categoryEvents.createValidationRejected({
            actorAdminId: userSub ?? 'unknown',
            sourceIp: req.ip ?? 'unknown',
          });
        }
        if (event === 'category.update') {
          this.categoryEvents.updateValidationRejected({
            actorAdminId: userSub ?? 'unknown',
            sourceIp: req.ip ?? 'unknown',
          });
        }
        if (event === 'category.reorder') {
          this.categoryEvents.reorderValidationRejected({
            actorAdminId: userSub ?? 'unknown',
            sourceIp: req.ip ?? 'unknown',
          });
        }
      }
      if (status === HttpStatus.NOT_FOUND) {
        const event =
          method === 'PATCH'
            ? 'category.update'
            : method === 'DELETE'
              ? 'category.delete'
              : null;
        if (event === 'category.update') {
          this.categoryEvents.updateNotFound({
            actorAdminId: userSub ?? 'unknown',
            sourceIp: req.ip ?? 'unknown',
          });
        }
        if (event === 'category.delete') {
          this.categoryEvents.deleteNotFound({
            actorAdminId: userSub ?? 'unknown',
            sourceIp: req.ip ?? 'unknown',
          });
        }
      }
      if (status === HttpStatus.FORBIDDEN) {
        const event =
          method === 'POST'
            ? 'create'
            : method === 'PATCH' && path.endsWith('/reorder')
              ? 'reorder'
              : method === 'PATCH'
                ? 'update'
                : method === 'DELETE'
                  ? 'delete'
                  : 'create';
        if (event === 'create') {
          this.categoryEvents.createRoleRefused({
            actorUserId: userSub ?? 'unknown',
            sourceIp: req.ip ?? 'unknown',
          });
        } else if (event === 'update') {
          this.categoryEvents.updateRoleRefused({
            actorUserId: userSub ?? 'unknown',
            sourceIp: req.ip ?? 'unknown',
          });
        } else if (event === 'delete') {
          this.categoryEvents.deleteRoleRefused({
            actorUserId: userSub ?? 'unknown',
            sourceIp: req.ip ?? 'unknown',
          });
        } else if (event === 'reorder') {
          this.categoryEvents.reorderRoleRefused({
            actorUserId: userSub ?? 'unknown',
            sourceIp: req.ip ?? 'unknown',
          });
        }
      }
    }

    // Menu validation rejections + not-found + role refused + rate-limited — use pathname
    if (req.url?.startsWith('/api/v1/chef/menus')) {
      const path =
        (req as Request & { path?: string }).path ??
        req.url?.split('?')[0] ??
        '';
      const userSub = (req as Request & { user?: { sub?: string } }).user?.sub;
      const method = req.method;
      const isAvailabilityPath = path.includes('/availability');
      let event: MenuEventName | null = null;
      if (isAvailabilityPath) {
        if (method === 'POST') event = 'menu.availability_add';
        if (method === 'DELETE') event = 'menu.availability_remove';
      } else {
        if (method === 'POST') event = 'menu.create';
        if (method === 'PATCH' && path.endsWith('/reorder'))
          event = 'menu.reorder';
        if (method === 'PATCH' && !path.endsWith('/reorder'))
          event = 'menu.update';
        if (method === 'DELETE') event = 'menu.soft_delete';
      }
      if (event && normalized.code === 'VALIDATION_ERROR') {
        this.menuEvents.emit({
          event,
          outcome: 'validation_rejected',
          actorUserId: userSub ?? null,
          actorRole: 'chef',
          sourceIp: req.ip ?? null,
        });
      }
      if (event && status === HttpStatus.NOT_FOUND) {
        this.menuEvents.emit({
          event,
          outcome: 'not_found',
          actorUserId: userSub ?? null,
          actorRole: 'chef',
          sourceIp: req.ip ?? null,
        });
      }
      if (event && status === HttpStatus.FORBIDDEN) {
        this.menuEvents.emit({
          event,
          outcome: 'role_refused',
          actorUserId: userSub ?? null,
          actorRole: 'chef',
          sourceIp: req.ip ?? null,
        });
      }
      if (
        event &&
        (status === HttpStatus.TOO_MANY_REQUESTS ||
          exception instanceof ThrottlerException)
      ) {
        this.menuEvents.emit({
          event,
          outcome: 'rate_limited',
          actorUserId: userSub ?? null,
          actorRole: 'chef',
          sourceIp: req.ip ?? null,
        });
      }
    }

    // Item validation rejections + not-found + role refused + upload errors — use pathname
    if (req.url?.startsWith('/api/v1/chef/items')) {
      const path =
        (req as Request & { path?: string }).path ??
        req.url?.split('?')[0] ??
        '';
      const userSub = (req as Request & { user?: { sub?: string } }).user?.sub;
      const method = req.method;
      const isImageRoute = path.endsWith('/images');
      const isImageUploadRoute = isImageRoute && method === 'POST';
      const isImageRemoveRoute = isImageRoute && method === 'DELETE';
      let event: ItemEventName | null = null;
      if (method === 'POST' && !isImageUploadRoute) event = 'item.create';
      if (method === 'PATCH' && path.endsWith('/reorder'))
        event = 'item.reorder';
      if (method === 'PATCH' && !path.endsWith('/reorder'))
        event = 'item.update';
      if (method === 'DELETE' && !isImageRemoveRoute)
        event = 'item.soft_delete';
      if (isImageRemoveRoute) event = 'item.image_remove';
      if (event && normalized.code === 'VALIDATION_ERROR') {
        this.itemEvents.emit({
          event,
          outcome: 'validation_rejected',
          actorUserId: userSub ?? null,
          actorRole: 'chef',
          sourceIp: req.ip ?? null,
        });
      }
      if (event && status === HttpStatus.NOT_FOUND) {
        this.itemEvents.emit({
          event,
          outcome: 'not_found',
          actorUserId: userSub ?? null,
          actorRole: 'chef',
          sourceIp: req.ip ?? null,
        });
      }
      if (event && status === HttpStatus.FORBIDDEN) {
        this.itemEvents.emit({
          event,
          outcome: 'role_refused',
          actorUserId: userSub ?? null,
          actorRole: 'chef',
          sourceIp: req.ip ?? null,
        });
      }
      if (
        status === HttpStatus.TOO_MANY_REQUESTS ||
        exception instanceof ThrottlerException
      ) {
        const throttleEvent: ItemEventName = isImageUploadRoute
          ? 'item.image_upload'
          : (event ?? 'item.update');
        this.itemEvents.emit({
          event: throttleEvent,
          outcome: 'rate_limited',
          actorUserId: userSub ?? null,
          actorRole: 'chef',
          sourceIp: req.ip ?? null,
        });
      }
      if (isImageUploadRoute && status === HttpStatus.PAYLOAD_TOO_LARGE) {
        this.itemEvents.emit({
          event: 'item.image_upload',
          outcome: 'payload_too_large',
          actorUserId: userSub ?? null,
          actorRole: 'chef',
          sourceIp: req.ip ?? null,
        });
      }
      if (isImageUploadRoute && status === HttpStatus.UNSUPPORTED_MEDIA_TYPE) {
        this.itemEvents.emit({
          event: 'item.image_upload',
          outcome: 'unsupported_media_type',
          actorUserId: userSub ?? null,
          actorRole: 'chef',
          sourceIp: req.ip ?? null,
        });
      }
    }

    res.status(status).json(normalized);
  }

  private normalize(
    exception: HttpException,
    status: number,
    raw: unknown,
  ): NormalizedError {
    if (exception instanceof ThrottlerException) {
      return {
        code: 'AUTH_RATE_LIMITED',
        message: 'Too many requests. Please retry later.',
      };
    }

    if (
      status === HttpStatus.BAD_REQUEST &&
      typeof raw === 'object' &&
      raw !== null
    ) {
      const obj = raw as { message?: unknown };
      if (Array.isArray(obj.message)) {
        return {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed.',
          details: { fields: obj.message },
        };
      }
    }

    if (typeof raw === 'object' && raw !== null) {
      const obj = raw as {
        code?: unknown;
        message?: unknown;
        details?: unknown;
        activeOrderId?: unknown;
      };
      if (typeof obj.code === 'string') {
        const details =
          typeof obj.details === 'object' && obj.details !== null
            ? (obj.details as Record<string, unknown>)
            : undefined;
        const result: NormalizedError = {
          code: obj.code,
          message:
            typeof obj.message === 'string'
              ? obj.message
              : 'An error occurred.',
          ...(details ? { details } : {}),
        };
        // FR-013: ADDRESS_IN_USE carries an `activeOrderId` deep-link hint
        // at the top level of the body (per the OpenAPI AddressInUseError
        // schema, which composes Error allOf { activeOrderId }).
        if (typeof obj.activeOrderId === 'string') {
          result.activeOrderId = obj.activeOrderId;
        }
        return result;
      }
      if (typeof obj.message === 'string') {
        return { code: this.codeFromStatus(status), message: obj.message };
      }
    }

    if (typeof raw === 'string') {
      return { code: this.codeFromStatus(status), message: raw };
    }

    return { code: this.codeFromStatus(status), message: 'An error occurred.' };
  }

  private codeFromStatus(status: number): string {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return 'AUTH_UNAUTHENTICATED';
      case HttpStatus.FORBIDDEN:
        return 'AUTH_FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      default:
        return 'UNKNOWN';
    }
  }

  private scrubCoordinates(node: unknown): void {
    if (Array.isArray(node)) {
      for (const child of node) this.scrubCoordinates(child);
      return;
    }
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      delete obj.latitude;
      delete obj.longitude;
      delete obj.coordinates;
      for (const key of Object.keys(obj)) {
        this.scrubCoordinates(obj[key]);
      }
    }
  }
}
