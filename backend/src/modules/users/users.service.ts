import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Used by AuthService for sign-in lookups. */
  findByPhone(phone: string) {
    return this.prisma.extended.user.findUnique({ where: { phone } });
  }

  /** Used by AuthService for getMe / refresh subject lookups. */
  findById(id: string) {
    return this.prisma.extended.user.findUnique({ where: { id } });
  }

  // Phase 6 (T080): updateProfile(userId, dto)
  // Phase 6 (T082): startPhoneChange(userId, dto)
  // Phase 6 (T084): verifyPhoneChange(userId, dto)
  // Phase 6 (T086): registerFcmToken(userId, dto)
}
