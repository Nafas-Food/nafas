import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class ChangePhoneVerifyDto {
  @ApiProperty({ example: '+201234567899' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  newPhone!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{4,8}$/)
  otpCode!: string;
}
