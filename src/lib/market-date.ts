/** Auction dates are Korean calendar dates, independent of the server's timezone. */
export function marketDateKey(date: Date): string {
  return new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 10);
}
export function marketDayStart(key: string): Date { return new Date(`${key}T00:00:00+09:00`); }
export function marketWindowStart(days: number, now = new Date()): Date {
  return new Date(marketDayStart(marketDateKey(now)).getTime() - days * 86400000);
}
