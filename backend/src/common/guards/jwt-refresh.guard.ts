import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Wraps `AuthGuard('jwt-refresh')` so that every passport-jwt rejection
 * (missing field, malformed, bad signature, expired, wrong token type,
 * missing jti) surfaces as the structured `AUTH_REFRESH_INVALID` shape
 * the OpenAPI contract promises. Without this override the default
 * UnauthorizedException leaves the HttpExceptionFilter to fall back to
 * `AUTH_UNAUTHENTICATED`, breaking the contract.
 */
@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {
  handleRequest<T>(err: unknown, user: T): T {
    if (err || !user) {
      throw new UnauthorizedException({
        code: 'AUTH_REFRESH_INVALID',
        message: 'Refresh credential is invalid.',
      });
    }
    return user;
  }
}
