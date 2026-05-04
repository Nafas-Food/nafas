import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';
/**
 * Restricts a route to the listed roles. Used by future phases
 * (admin-only endpoints in Phase 3, chef-only in Phase 4 onward).
 * Phase 1 ships the decorator + guard; no route uses it yet.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
