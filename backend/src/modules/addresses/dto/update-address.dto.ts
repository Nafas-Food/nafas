import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateAddressDto } from './create-address.dto';

export class UpdateAddressDto extends PartialType(CreateAddressDto) {
  @ApiPropertyOptional({ description: 'Sub-typed for Swagger only.' })
  private readonly _swaggerMarker?: undefined;
}
