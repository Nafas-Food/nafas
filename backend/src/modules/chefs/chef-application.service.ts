import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

type EligibilityRefusal =
  | { code: 'ALREADY_CHEF'; chefId: string }
  | { code: 'APPLICATION_PENDING'; applicationId: string }
  | { code: 'APPLICATION_COOLDOWN_IN_EFFECT'; earliestResubmitAt: string };

@Injectable()
export class ChefApplicationService {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Phase 3 R4 cooldown gate. Throws ConflictException with the appropriate
   * structured payload on every non-eligible state. Returns the prior Chef row
   * (or null) so the caller can decide between an in-place update and a fresh
   * create.
   *
   * NOTE: this is the ONLY Phase 3 read that uses the bare prismaService — it
   * must see rejected (rejectedAt != null) and revoked (deletedAt != null)
   * rows that the extended client would hide.
   */
  async assertEligibleToApply(userId: string) {
    const existing = await this.prismaService.chef.findFirst({
      where: { userId },
    });

    if (!existing) return { existing: null };

    if (existing.isVerified && !existing.deletedAt) {
      throw this.conflict({ code: 'ALREADY_CHEF', chefId: existing.id });
    }
    if (!existing.isVerified && !existing.rejectedAt && !existing.deletedAt) {
      throw this.conflict({
        code: 'APPLICATION_PENDING',
        applicationId: existing.id,
      });
    }
    const blocker = existing.deletedAt ?? existing.rejectedAt;
    if (blocker && blocker.getTime() + COOLDOWN_MS > Date.now()) {
      const earliestResubmitAt = new Date(
        blocker.getTime() + COOLDOWN_MS,
      ).toISOString();
      throw this.conflict({
        code: 'APPLICATION_COOLDOWN_IN_EFFECT',
        earliestResubmitAt,
      });
    }
    return { existing };
  }

  private conflict(payload: EligibilityRefusal): ConflictException {
    return new ConflictException(payload);
  }
}
