import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class ReorderMenusDto {
  @IsArray()
  @ArrayUnique({ message: 'MENUS_REORDER_NOT_EXACT_SET' })
  @IsUUID('4', { each: true, message: 'MENUS_REORDER_NOT_EXACT_SET' })
  menuIds!: string[];
}
