import { format } from "date-fns"

/** A day as the app keys it: "2026-10-14", on the reader's own calendar. */
export const dayKey = (d: Date) => format(d, "yyyy-MM-dd")

/**
 * The week starts on Monday (content.md C05: the default in India, and where
 * most of the world's working week starts). One constant, so the month grid,
 * the week view, the mini month, what is fetched and a doc's "next week"
 * agree.
 */
export const WEEK_STARTS_ON = 1 as const
