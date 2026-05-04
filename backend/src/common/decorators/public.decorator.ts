import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/**
 * Marks a route as bypassing JwtAuthGuard. Used on /auth/send-otp,
 * /auth/register, /auth/sign-in, /auth/refresh.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
