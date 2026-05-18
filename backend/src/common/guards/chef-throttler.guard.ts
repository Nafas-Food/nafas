import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Per-chef throttle key derivation for the FR-012b image-upload cap.
 *
 * Phase 3 R1 enforces @unique on Chef.userId — a user has exactly
 * one chef row — so keying by the JWT `sub` (user id) is equivalent
 * to keying by chef id, without a DB lookup inside the throttle
 * check. Apply this guard explicitly via @UseGuards on the upload
 * route ONLY; every other route stays on the global IP-keyed
 * ThrottlerGuard from Phase 1.
 *
 * The global ThrottlerGuard ALSO fires on the upload route and
 * applies its IP-keyed check against the same @Throttle override.
 * The request must pass BOTH the per-IP and the per-user checks —
 * the per-IP backstop is preserved for free (research R3).
 *
 * Falls back to req.ip when req.user is somehow absent (defensive;
 * should never happen because JwtAuthGuard runs first).
 */
@Injectable()
export class ChefThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return (req.user?.sub as string | undefined) ?? req.ip;
  }
}
