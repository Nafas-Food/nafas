import { ApiProperty } from '@nestjs/swagger';
import { IsJWT, IsString } from 'class-validator';

export class SignOutDto {
  @ApiProperty()
  @IsString()
  @IsJWT()
  refreshToken!: string;
}
