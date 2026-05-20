import { Module } from '@nestjs/common';
import { ChefsModule } from '../chefs/chefs.module';
import { CategoriesModule } from '../categories/categories.module';
import { UsersModule } from '../users/users.module';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({
  imports: [ChefsModule, CategoriesModule, UsersModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
