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

export interface PinPlacement<E> {
  /** True y for the cluster's representative (newest) event — never displaced. */
  y: number;
  event: E;
  /** Events collapsed into this pin because they collided with it. */
  clusterCount: number;
}

/**
 * Place event pins at their TRUE positions: a pin either owns its exact y or
 * joins the previous (newer) placed pin's cluster. Position IS the time
 * encoding — nothing is ever shoved down the axis (that is what broke v1:
 * 132 events cascaded into a 5.5k px stack divorced from the hour scale).
 */
export function placePins<E>(
  events: E[],
  tsOf: (e: E) => number | null,
  yOf: (ts: number) => number,
  minGap: number,
): PinPlacement<E>[] {
  const items = events
    .map((e) => {
      const ts = tsOf(e);
      return ts == null ? null : { e, ts, y: yOf(ts) };
    })
    .filter((x): x is { e: E; ts: number; y: number } => x !== null)
    .sort((a, b) => b.ts - a.ts); // newest first → smallest y first

  const placed: PinPlacement<E>[] = [];
  for (const item of items) {
    const last = placed[placed.length - 1];
    // items come in increasing y; collision = closer than minGap to the last pin
    if (last && item.y - last.y < minGap) {
      last.clusterCount += 1;
      continue;
    }
    placed.push({ y: item.y, event: item.e, clusterCount: 0 });
  }
  return placed;
}
