import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Shared bilingual JSON shape for Menu.name, Item.name,
 * Item.description (and the Phase 3 Category.name).
 *
 * Both locales are required (FR-030). Each locale is trimmed
 * server-side BEFORE the length check so leading/trailing
 * whitespace cannot inflate the value past the cap.
 *
 * The maxLength cap is set per-instance (60 for names, 500 for
 * descriptions) by extending this class — see CreateMenuDto,
 * CreateItemDto.
 */
export class BilingualText {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'BILINGUAL_EN_REQUIRED' })
  @MinLength(1, { message: 'BILINGUAL_EN_REQUIRED' })
  en!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'BILINGUAL_AR_REQUIRED' })
  @MinLength(1, { message: 'BILINGUAL_AR_REQUIRED' })
  ar!: string;
}

/**
 * Helper to apply a custom per-locale max length on instances of
 * BilingualText subclasses. Used in concrete DTOs to set the
 * 60-char (name) or 500-char (description) cap with the right
 * error code.
 *
 * Returns a class-validator decorator factory you compose on the
 * field with `@ValidateNested()` + `@Type(() => CappedBilingualText(...))`.
 *
 * In practice we declare a per-locale-capped subclass per field;
 * see `MenuName60`, `ItemName60`, and `ItemDescription500` below.
 */
function bilingualSubclass(
  maxLen: number,
  requiredCode: string,
  tooLongCode: string,
): typeof BilingualText {
  // The subclass MUST re-assert @IsString + @MinLength alongside @MaxLength.
  // class-validator does not merge parent + child metadata when both
  // decorate the same property; the subclass's metadata replaces the
  // parent's. Without re-declaring the "required" validators here,
  // empty / whitespace-only en/ar values would pass validation, breaking
  // FR-030 ("empty value on either locale is refused").
  class Capped extends BilingualText {
    @Transform(({ value }) =>
      typeof value === 'string' ? value.trim() : value,
    )
    @IsString({ message: requiredCode })
    @MinLength(1, { message: requiredCode })
    @MaxLength(maxLen, { message: tooLongCode })
    declare en: string;

    @Transform(({ value }) =>
      typeof value === 'string' ? value.trim() : value,
    )
    @IsString({ message: requiredCode })
    @MinLength(1, { message: requiredCode })
    @MaxLength(maxLen, { message: tooLongCode })
    declare ar: string;
  }
  return Capped;
}

/** Bilingual menu name capped at 60 characters per locale. */
export const MenuName60 = bilingualSubclass(
  60,
  'MENU_NAME_REQUIRED',
  'MENU_NAME_TOO_LONG',
);

/** Bilingual item name capped at 60 characters per locale. */
export const ItemName60 = bilingualSubclass(
  60,
  'ITEM_NAME_REQUIRED',
  'ITEM_NAME_TOO_LONG',
);

/** Bilingual item description capped at 500 characters per locale. */
export const ItemDescription500 = bilingualSubclass(
  500,
  'ITEM_DESCRIPTION_REQUIRED',
  'ITEM_DESCRIPTION_TOO_LONG',
);
