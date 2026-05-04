import { Role } from '@prisma/client';

export interface SerializedUser {
  id: string;
  phone: string;
  email: string | null;
  fullName: string;
  role: Role;
  phoneVerified: boolean;
}

/**
 * Strips internal fields (passwordHash, fcmToken, isTest, deletedAt, …)
 * before returning a User over the wire. Single source of truth for both
 * AuthService and UsersService.
 */
export function serializeUser(u: {
  id: string;
  phone: string;
  email: string | null;
  fullName: string;
  role: Role;
  phoneVerified: boolean;
}): SerializedUser {
  return {
    id: u.id,
    phone: u.phone,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    phoneVerified: u.phoneVerified,
  };
}
