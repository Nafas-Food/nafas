import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectApplicationDto {
  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @IsString()
  @Length(1, 1000)
  reason!: string;
}
