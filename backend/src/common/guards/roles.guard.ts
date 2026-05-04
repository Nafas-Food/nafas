import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { CurrentUserPayload } from '../decorators/current-user.decorator';

/**
 * Restricts handlers decorated with @Roles(...) to those roles.
 * Phase 1 ships this guard alongside @Roles() but no Phase 1 route
 * uses it yet (admin/chef restrictions begin in Phase 3).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const user = context.switchToHttp().getRequest().user as CurrentUserPayload | undefined;
    if (!user) throw new ForbiddenException();
    if (!required.includes(user.role as Role)) throw new ForbiddenException();
    return true;
  }
}