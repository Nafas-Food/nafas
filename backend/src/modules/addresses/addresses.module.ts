import { Module } from '@nestjs/common';
import { LoggingModule } from '../../common/logging/logging.module';
import { OrdersModule } from '../orders/orders.module';
import { AddressesController } from './addresses.controller';
import { AddressesService } from './addresses.service';

@Module({
  imports: [LoggingModule, OrdersModule],
  controllers: [AddressesController],
  providers: [AddressesService],
})
export class AddressesModule {}
