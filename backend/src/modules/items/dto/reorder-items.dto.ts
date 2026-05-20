import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class ReorderItemsDto {
  @IsArray()
  @ArrayUnique({ message: 'ITEMS_REORDER_NOT_EXACT_SET' })
  @IsUUID('4', { each: true, message: 'ITEMS_REORDER_NOT_EXACT_SET' })
  itemIds!: string[];
}
