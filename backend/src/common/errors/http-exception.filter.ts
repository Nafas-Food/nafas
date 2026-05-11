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
