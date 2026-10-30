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

import { lazyView } from "@/lib/lazy/lazyView"

export const BoardPart = lazyView(() => import("@/components/table/DataTableBoard"))
export const CalendarPart = lazyView(() => import("@/components/table/DataTableCalendar"))
export const ChartPart = lazyView(() => import("@/components/table/DataTableChart"))
/** B4's gallery: the view's rows as cards, a cover and the fields shown. */
export const GalleryPart = lazyView(() => import("@/components/table/layouts/TableGallery"))
/** B4's timeline and Gantt: the view's rows as bars across their days, and what each waits on. */
export const TimelinePart = lazyView(() => import("@/components/table/layouts/TableTimeline"))
export const RecordPart = lazyView(() => import("@/components/table/RecordPanel"))
export const TrashPart = lazyView(() => import("@/components/table/trash/TableTrash"))
export const PublishPart = lazyView(() => import("@/components/marketplace/PublishTemplateDialog"))
export const SharePart = lazyView(() => import("@/components/table/ShareTableDialog"))
/** The table's own forms (B5): each answer a row of the table; for its managers. */
export const FormsPart = lazyView(() => import("@/components/project/ProjectFormsDialog"))
// A view's rules applied to the rows the page holds: the server's windows come ruled.
export const RulesPart = lazyView(() => import("@/lib/tables/applyRules"))
/** Who else is on the table, and where (tables A7): drawn once the table is open. */
export const PresencePart = lazyView(() => import("@/components/table/presence/TablePresence"))
/**
 * Tables T5c paid for the windows with these. The phone's list (a table with
 * more than four fields, on a phone), warmed as soon as the page knows it's
 * narrow; the page's dropdown menus, warmed as the pointer or the focus
 * reaches a trigger; and the save dot, whose place is held until it comes.
 */
export const ListPart = lazyView(() => import("@/components/table/TableRowList"))
export const MenusPart = lazyView(() => import("@/components/table/TableMenus"))
export const SaveDotPart = lazyView(() => import("@/components/docEditor/SaveDot"))
/** The table's saved views (migration 512). */
export const ViewsPart = lazyView(() => import("@/components/table/views/TableViews"))

/** Every part's chunk, loaded: what a test of the page waits for first. */
export const loadTablePageParts = () =>
  Promise.all([
    RulesPart.warm(),
    BoardPart.warm(),
    CalendarPart.warm(),
    ChartPart.warm(),
    GalleryPart.warm(),
    TimelinePart.warm(),
    RecordPart.warm(),
    TrashPart.warm(),
    PublishPart.warm(),
    SharePart.warm(),
    ListPart.warm(),
    MenusPart.warm(),
    SaveDotPart.warm(),
    ViewsPart.warm(),
  ])

/** Starts loading a view's chunk: a tab under the pointer or the focus. */
export function warmView(view: string): void {
  const part = view === "board" ? BoardPart : view === "calendar" ? CalendarPart : view === "chart" ? ChartPart : view === "gallery" ? GalleryPart : view === "list" ? ListPart : view === "timeline" || view === "gantt" ? TimelinePart : null
  void part?.prefetch()
}
