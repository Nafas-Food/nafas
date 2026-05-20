import { Injectable } from '@nestjs/common';
import { ChefsService } from '../chefs/chefs.service';
import { CategoriesService } from '../categories/categories.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class HomeService {
  constructor(
    private readonly chefsService: ChefsService,
    private readonly categoriesService: CategoriesService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * FR-021 + FR-022: composes the four Home strips in one round-trip.
   * Never reads prisma.* directly (Constitution Principle III).
   */
  async findHomeForUser(userId: string) {
    const user = await this.usersService.findById(userId);
    const [openChefs, categories, topRated] = await Promise.all([
      this.chefsService.findManyForDiscovery({ isOpen: true, pageSize: 20 }),
      this.categoriesService.listActive(),
      this.chefsService.findTopRated(12),
    ]);
    // The User model stores only `fullName`; split server-side so the
    // wire field matches its name and clients don't all reinvent it.
    const firstName = (user?.fullName ?? '').trim().split(/\s+/)[0] ?? '';
    return {
      greeting: { userFirstName: firstName },
      openChefs,
      categories,
      topRated,
    };
  }
}
