import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Mona Hassan', minLength: 2, maxLength: 80 })
  @IsString()
  @Length(2, 80)
  fullName!: string;

  @ApiProperty({ example: '+201234567890' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @ApiProperty({
    example: 'a-strong-passphrase',
    minLength: 8,
    description:
      'Password. Minimum length 8, no character-class rules (FR-006a).',
  })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: '1990-01-01', format: 'date' })
  @Type(() => Date)
  @IsDate()
  birthdate!: Date;

  @ApiProperty({ example: '123456', pattern: '^\\d{4,8}$' })
  @IsString()
  @Matches(/^\d{4,8}$/)
  otpCode!: string;

  @ApiProperty({
    example: 'mona@example.com',
    required: false,
    description:
      'Optional email. When provided, the OTP is verified against the email channel instead of SMS, and the address is bound to the new account.',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
}
