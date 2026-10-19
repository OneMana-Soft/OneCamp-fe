"use client"

/**
 * The parts of a table's page that aren't its first screen, the grid: each a
 * chunk of its own, loaded when its view, panel or dialog first opens, and
 * warmed (lazyView's warm) as the pointer or the focus reaches what opens it,
 * or when the page is idle. A loaded part draws at once (no Suspense), so a
 * tab switched back and forth never shows its fallback again.
 *
 * The table route carried every view, the record, the trash, the share
 * dialog and the column menu's settings in its first load: about 1.63 MB of
 * source after tables A1, A2, T1 and T2 (T3's trim, 18 Oct 2026). app/
 * firstLoad.test.ts holds the route to its ceiling, and fails if one of these
 * comes back into it.
 */

import { lazyView } from "@/components/task/LazyView"

export const BoardPart = lazyView(() => import("@/components/table/DataTableBoard"))
export const CalendarPart = lazyView(() => import("@/components/table/DataTableCalendar"))
export const ChartPart = lazyView(() => import("@/components/table/DataTableChart"))
export const RecordPart = lazyView(() => import("@/components/table/RecordPanel"))
export const TrashPart = lazyView(() => import("@/components/table/trash/TableTrash"))
export const PublishPart = lazyView(() => import("@/components/marketplace/PublishTemplateDialog"))
export const SharePart = lazyView(() => import("@/components/guest/GuestLinkSection"))

/** Every part's chunk, loaded: what a test of the page waits for first. */
export const loadTablePageParts = () =>
  Promise.all([BoardPart.warm(), CalendarPart.warm(), ChartPart.warm(), RecordPart.warm(), TrashPart.warm(), PublishPart.warm(), SharePart.warm()])

/** Starts loading a view's chunk: a tab under the pointer or the focus. */
export function warmView(view: string): void {
  const part = view === "board" ? BoardPart : view === "calendar" ? CalendarPart : view === "chart" ? ChartPart : null
  part?.warm().catch(() => {})
}
