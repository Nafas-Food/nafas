import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class SendOtpDto {
  @ApiProperty({
    example: '+201234567890',
    description: 'E.164-formatted phone number.',
  })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @ApiProperty({
    example: 'mona@example.com',
    required: false,
    description:
      'Optional email. When provided, the OTP is delivered by email instead of SMS — phone remains the identity anchor.',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
}
