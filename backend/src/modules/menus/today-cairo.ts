/**
 * Returns 0..6 (0 = Sunday) for the current weekday in Africa/Cairo.
 *
 * Single source of truth for "today" in every Phase 4 today-available
 * read (FR-017, research R2). Pass a `now` argument in tests to pin
 * the clock without `jest.useFakeTimers()`.
 *
 * Node 20 LTS ships full ICU data, so 'Africa/Cairo' resolves without
 * --with-intl flags.
 */
export function todaysCairoWeekday(now: Date = new Date()): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    weekday: 'short',
  }).format(now);

  const order: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const value = order[weekday];
  if (value === undefined) {
    throw new Error(`Unexpected weekday from Intl: ${weekday}`);
  }
  return value;
}
