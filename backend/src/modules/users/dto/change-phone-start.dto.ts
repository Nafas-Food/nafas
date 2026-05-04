import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class ChangePhoneStartDto {
  @ApiProperty({ example: '+201234567899' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  newPhone!: string;
}
