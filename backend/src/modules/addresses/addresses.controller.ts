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
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
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
  @ApiOperation({
    summary:
      "List the authenticated customer's saved addresses, ordered by creation time.",
  })
  @ApiOkResponse({
    description: 'Saved addresses, possibly empty.',
    type: [AddressResponseDto],
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access credential.',
  })
  list(@Req() req: JwtRequest): Promise<AddressResponseDto[]> {
    return this.svc.list(req.user.sub);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Save a new delivery address for the authenticated customer.',
  })
  @ApiCreatedResponse({
    description: 'Address created.',
    type: AddressResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Validation error (VALIDATION_ERROR).',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access credential.',
  })
  create(
    @Req() req: JwtRequest,
    @Body() dto: CreateAddressDto,
  ): Promise<AddressResponseDto> {
    return this.svc.create(req.user.sub, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      "Update one of the authenticated customer's saved addresses (partial merge).",
  })
  @ApiOkResponse({
    description: 'Updated address.',
    type: AddressResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Validation error (VALIDATION_ERROR).',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access credential.',
  })
  @ApiNotFoundResponse({
    description:
      'Address not found (or owned by a different customer — same response per FR-015).',
  })
  update(
    @Req() req: JwtRequest,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ): Promise<AddressResponseDto> {
    return this.svc.update(req.user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Soft-delete one of the authenticated customer's saved addresses.",
  })
  @ApiNoContentResponse({ description: 'Address soft-deleted.' })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access credential.',
  })
  @ApiNotFoundResponse({
    description:
      'Address not found (or owned by a different customer — same response per FR-015).',
  })
  @ApiConflictResponse({
    description:
      'Address is in use by an order in non-terminal status (ADDRESS_IN_USE).',
  })
  remove(@Req() req: JwtRequest, @Param('id') id: string): Promise<void> {
    return this.svc.softDelete(req.user.sub, id);
  }
}
