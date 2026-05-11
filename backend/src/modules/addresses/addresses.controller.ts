import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AddressesService } from './addresses.service';
import { AddressResponseDto } from './dto/address.response.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

interface JwtRequest extends Request {
  user: { sub: string };
}

@ApiTags('Addresses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('addresses')
export class AddressesController {
  constructor(private readonly svc: AddressesService) {}

  @Get()
  list(@Req() req: JwtRequest): Promise<AddressResponseDto[]> {
    return this.svc.list(req.user.sub);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Req() req: JwtRequest,
    @Body() dto: CreateAddressDto,
  ): Promise<AddressResponseDto> {
    return this.svc.create(req.user.sub, dto);
  }

  @Patch(':id')
  update(
    @Req() req: JwtRequest,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ): Promise<AddressResponseDto> {
    return this.svc.update(req.user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Req() req: JwtRequest, @Param('id') id: string): Promise<void> {
    return this.svc.softDelete(req.user.sub, id);
  }
}
