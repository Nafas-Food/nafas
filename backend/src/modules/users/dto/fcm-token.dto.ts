import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class FcmTokenDto {
  @ApiProperty()
  @IsString()
  @Length(1, 4096)
  fcmToken!: string;
}
