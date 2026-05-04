import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class SignInDto {
  @ApiProperty({ example: '+201234567890' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password!: string;
}
