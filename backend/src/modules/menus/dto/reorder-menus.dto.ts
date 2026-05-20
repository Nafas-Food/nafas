import { ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class ReorderMenusDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'MENUS_REORDER_NOT_EXACT_SET' })
  @ArrayUnique({ message: 'MENUS_REORDER_NOT_EXACT_SET' })
  @IsUUID('4', { each: true, message: 'MENUS_REORDER_NOT_EXACT_SET' })
  menuIds!: string[];
}
