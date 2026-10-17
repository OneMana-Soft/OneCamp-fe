import { localDay } from "@/lib/utils/timeZone"

/**
 * A day as the app keys it: "2026-10-14", on the reader's own calendar. The
 * calendar's and the editor's name for localDay, the one way the app writes a
 * local day.
 */
export const dayKey: (d: Date) => string = localDay

/**
 * The week starts on Monday (content.md C05: the default in India, and where
 * most of the world's working week starts). One constant, so the month grid,
 * the week view, the mini month, what is fetched and a doc's "next week"
 * agree.
 */
export const WEEK_STARTS_ON = 1 as const
