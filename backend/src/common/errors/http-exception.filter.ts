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

interface NormalizedError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

@Catch(HttpException)
export class HttpExceptionNormalizerFilter implements ExceptionFilter {
  constructor(private readonly events: AuthEventLogger) {}

  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const raw = exception.getResponse();

    const normalized = this.normalize(exception, status, raw);

    // Side-effects — emit auth events for the cases FR-020 names that are
    // unreachable from inside controllers/services.
    if (exception instanceof ThrottlerException) {
      this.events.emit({
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
        this.events.emit({
          event: 'auth.password_validation',
          outcome: 'too_short',
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
    // 1) ThrottlerException — uniform rate-limit code
    if (exception instanceof ThrottlerException) {
      return {
        code: 'AUTH_RATE_LIMITED',
        message: 'Too many requests. Please retry later.',
      };
    }

    // 2) Class-validator failure (NestJS ValidationPipe default shape):
    //    { statusCode, message: string[], error: 'Bad Request' }
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

    // 3) Our own structured throws — `new ConflictException({ code, message })` etc.
    if (typeof raw === 'object' && raw !== null) {
      const obj = raw as { code?: unknown; message?: unknown };
      if (typeof obj.code === 'string') {
        return {
          code: obj.code,
          message:
            typeof obj.message === 'string'
              ? obj.message
              : 'An error occurred.',
        };
      }
      if (typeof obj.message === 'string') {
        return { code: this.codeFromStatus(status), message: obj.message };
      }
    }

    // 4) String body — bare HttpException('msg', 404) etc.
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
}
