import { IsString } from 'class-validator';

export class UpsertSettingDto {
  @IsString()
  value!: string;
}
