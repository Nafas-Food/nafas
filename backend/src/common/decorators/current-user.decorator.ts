import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentUserPayload {
  sub: string; // User.id
  role: 'customer' | 'chef' | 'admin' | 'driver';
  type: 'access' | 'refresh';
  jti?: string; // present on refresh credentials
  exp?: number; // populated by passport-jwt on validated tokens
}

/**
 * Reads the JWT-derived user payload that JwtStrategy.validate() set
 * on `request.user`. Use as: `@CurrentUser() user: CurrentUserPayload`.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as CurrentUserPayload;
  },
);
