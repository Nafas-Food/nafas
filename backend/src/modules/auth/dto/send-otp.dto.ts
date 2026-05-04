import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class SendOtpDto {
  @ApiProperty({
    example: '+201234567890',
    description: 'E.164-formatted phone number.',
  })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;
}
