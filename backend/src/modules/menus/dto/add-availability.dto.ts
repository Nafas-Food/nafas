import { IsInt, Max, Min } from 'class-validator';

export class AddAvailabilityDto {
  @IsInt({ message: 'MENU_AVAILABILITY_INVALID_WEEKDAY' })
  @Min(0, { message: 'MENU_AVAILABILITY_INVALID_WEEKDAY' })
  @Max(6, { message: 'MENU_AVAILABILITY_INVALID_WEEKDAY' })
  dayOfWeek!: number;
}
