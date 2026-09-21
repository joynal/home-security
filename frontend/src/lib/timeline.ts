/**
 * Timeline geometry helpers — pure functions shared by TimelineRail and PlaybackPage.
 * Time is LOCAL: day boundaries come from local midnight, positions are epoch-based.
 */

export const TOP_PAD = 16;
export const DAY_SECONDS = 86400;

/** Local midnight of a YYYY-MM-DD calendar date, in epoch seconds. */
export function dayStartEpoch(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getTime() / 1000;
}

export function railHeight(pxPerHour: number): number {
  return 24 * pxPerHour + TOP_PAD * 2;
}

/** Epoch seconds → y px on the rail (top = end of day / latest). */
export function tsToY(ts: number, day0: number, pxPerHour: number): number {
  return TOP_PAD + ((day0 + DAY_SECONDS - ts) / DAY_SECONDS) * (24 * pxPerHour);
}

/** y px on the rail → epoch seconds (clamped to the day). */
export function yToTs(y: number, day0: number, pxPerHour: number): number {
  const totalPx = 24 * pxPerHour;
  const clamped = Math.max(0, Math.min(totalPx, y - TOP_PAD));
  return Math.round(day0 + DAY_SECONDS - (clamped / totalPx) * DAY_SECONDS);
}
