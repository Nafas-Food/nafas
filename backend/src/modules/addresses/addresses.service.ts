import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AddressEventLogger } from '../../common/logging/address-event.logger';
import { OrdersService } from '../orders/orders.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { AddressResponseDto } from './dto/address.response.dto';

@Injectable()
export class AddressesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: AddressEventLogger,
    private readonly orders: OrdersService,
  ) {}

  async list(userId: string): Promise<AddressResponseDto[]> {
    const rows = await this.prisma.extended.userAddress.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(AddressResponseDto.from);
  }

  async create(
    userId: string,
    dto: CreateAddressDto,
  ): Promise<AddressResponseDto> {
    const row = await this.prisma.userAddress.create({
      data: {
        userId,
        label: dto.label,
        streetName: dto.streetName ?? '',
        building: dto.building ?? null,
        floor: dto.floor ?? null,
        apartment: dto.apartment ?? null,
        latitude: dto.latitude,
        longitude: dto.longitude,
        notes: dto.notes ?? null,
      },
    });
    this.events.emit({
      event: 'address.create',
      outcome: 'success',
      actorId: userId,
      addressId: row.id,
    });
    return AddressResponseDto.from(row);
  }

  async findOwnedOrThrow(id: string, userId: string) {
    const row = await this.prisma.extended.userAddress.findFirst({
      where: { id, userId },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'ADDRESS_NOT_FOUND',
        message: 'Address not found.',
      });
    }
    return row;
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateAddressDto,
  ): Promise<AddressResponseDto> {
    await this.findOwnedOrThrow(id, userId);
    const row = await this.prisma.userAddress.update({
      where: { id },
      data: {
        ...(dto.label !== undefined && { label: dto.label }),
        ...(dto.streetName !== undefined && { streetName: dto.streetName }),
        ...(dto.building !== undefined && { building: dto.building ?? null }),
        ...(dto.floor !== undefined && { floor: dto.floor ?? null }),
        ...(dto.apartment !== undefined && {
          apartment: dto.apartment ?? null,
        }),
        ...(dto.latitude !== undefined && { latitude: dto.latitude }),
        ...(dto.longitude !== undefined && { longitude: dto.longitude }),
        ...(dto.notes !== undefined && { notes: dto.notes ?? null }),
      },
    });
    this.events.emit({
      event: 'address.update',
      outcome: 'success',
      actorId: userId,
      addressId: id,
    });
    return AddressResponseDto.from(row);
  }

  async softDelete(userId: string, id: string): Promise<void> {
    await this.findOwnedOrThrow(id, userId);

    const active = await this.orders.hasActiveOrderForAddress(id, userId);
    if (active) {
      this.events.emit({
        event: 'address.delete',
        outcome: 'in_use',
        actorId: userId,
        addressId: id,
      });
      throw new ConflictException({
        code: 'ADDRESS_IN_USE',
        message: 'Address is in use by an order in progress.',
        activeOrderId: active.activeOrderId,
      });
    }

    await (this.prisma as any).userAddress.softDelete({ where: { id } });
    this.events.emit({
      event: 'address.delete',
      outcome: 'success',
      actorId: userId,
      addressId: id,
    });
  }
}
