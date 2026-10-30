import { parseViewConfig, type TableField, type TableView } from "@/services/tableService"
import { readViewRules, type ViewRules } from "@/lib/tables/viewRules"
import { readDisplay, type TableDisplay } from "@/lib/tables/display"
import { viewFromQuery, type ViewChoice } from "@/lib/tables/tableView"

/**
 * What a saved view holds (migration 512): its layout, its rules, and how it
 * draws. A phone's list mode stays the reader's own, per device, so a view
 * doesn't carry it.
 */
export interface ViewState {
  layout: ViewChoice
  rules: ViewRules
  display: Omit<TableDisplay, "list" | "shut">
}

/** How a table draws as a view keeps it: all but a phone's list mode and the groups a reader collapsed. */
export function drawnAs(d: TableDisplay): ViewState["display"] {
  return { rowHeight: d.rowHeight, hidden: d.hidden, summary: d.summary, widths: d.widths, boardGroup: d.boardGroup, colors: d.colors }
}

/** A saved view as the page applies it, made good against the table's fields now. */
export function viewStateOf(view: TableView, fields: TableField[]): ViewState {
  const config = parseViewConfig(view)
  return { layout: viewFromQuery(view.type), rules: readViewRules(config.rules, fields), display: drawnAs(readDisplay(config.display)) }
}

/** What a view's config keeps of a state; its layout is the view's type. */
export function viewConfig(state: ViewState): Record<string, unknown> {
  return { rules: state.rules, display: state.display }
}

/** Whether two states lay a table out, choose its rows and draw them alike. */
export function sameViewState(a: ViewState, b: ViewState): boolean {
  return canonical(a) === canonical(b)
}

// JSON with every object's keys in one order, so two states compare by what
// they hold, not by the order their keys were written in.
function canonical(v: unknown): string {
  return JSON.stringify(v, (_key, x: unknown) =>
    x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x,
  )
}

/**
 * Whether the reader may change a view: one of their own (a view with an
 * owner is listed only for its owner), or a shared one when they manage the
 * table and it isn't locked. The server holds the same rule.
 */
export function mayChangeView(view: TableView, canManage: boolean): boolean {
  return !view.locked && (view.owner_id != null || canManage)
}

/** The view a table opens in: the one its link names, else the reader's last, else the first. */
export function openingView(views: TableView[], named: string | null, last: string | null): TableView | null {
  return views.find((v) => v.id === named) ?? views.find((v) => v.id === last) ?? views[0] ?? null
}

const lastKey = (tableId: string) => `onecamp:tableSavedView:${tableId}`

/** The saved view this reader last opened on a table, and its config as this device opened, picked or saved it. */
export interface LastView {
  id: string
  /** Null under a key kept before, which holds the view's id alone. */
  opened: Record<string, unknown> | null
}

/** The saved view this reader last opened on a table; null when none is kept. */
export function loadLastView(tableId: string): LastView | null {
  try {
    const kept = window.localStorage.getItem(lastKey(tableId))
    if (!kept) return null
    if (!kept.startsWith("{")) return { id: kept, opened: null }
    const s = JSON.parse(kept) as { id?: unknown; opened?: unknown }
    if (typeof s.id !== "string") return null
    return { id: s.id, opened: s.opened && typeof s.opened === "object" ? (s.opened as Record<string, unknown>) : null }
  } catch {
    return null
  }
}

/** Keeps the view this reader opened on a table, as this device shows it now: opened, picked, reset or saved. */
export function saveLastView(tableId: string, viewId: string, state: ViewState): void {
  try {
    window.localStorage.setItem(lastKey(tableId), JSON.stringify({ id: viewId, opened: viewConfig(state) }))
  } catch {
    // private mode or full storage: the table opens in its first view
  }
}

/**
 * Whether a device holds a change of the reader's own to the view a table
 * opens in, not saved: its address names another layout, or the rules and
 * look it keeps aren't the view's as it last opened or was saved there (with
 * none kept, the table's as it draws by default). Without one the view opens
 * as it's saved now, so a view saved on one device looks the same on every
 * other (V-53). A phone's list mode and the groups a reader collapsed are the
 * device's own, never a change.
 */
export function keepsOwnChange(
  view: TableView,
  last: LastView | null,
  kept: { layout: ViewChoice | null; rules: ViewRules; display: TableDisplay },
  fields: TableField[],
): boolean {
  if (kept.layout && kept.layout !== viewFromQuery(view.type)) return true
  const opened = last?.id === view.id ? last.opened : null
  const base = { rules: readViewRules(opened?.rules, fields), display: drawnAs(readDisplay(opened?.display)) }
  return canonical(base) !== canonical({ rules: kept.rules, display: drawnAs(kept.display) })
}
