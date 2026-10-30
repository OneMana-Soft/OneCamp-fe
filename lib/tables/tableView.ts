import type { ViewType } from "@/services/tableService"

/** The ways a table can be shown: a layout, and every saved view's. */
export type ViewChoice = ViewType

export const VIEW_CHOICES: readonly ViewChoice[] = ["grid", "board", "calendar", "chart", "gallery", "list", "timeline", "gantt"]

/**
 * The layouts that show the rows as the grid holds them (B4): the server's
 * windows of the view in its order, its colours, and its fields shown or
 * hidden. The list takes the grid's groups too, as the phone's does.
 */
export const rowsView = (v: ViewChoice): boolean => v !== "board" && v !== "calendar" && v !== "chart"

/** The view a link asked for (?view=board), or the grid for anything else. */
export function viewFromQuery(value: string | null | undefined): ViewChoice {
  return (VIEW_CHOICES as readonly string[]).includes(value ?? "") ? (value as ViewChoice) : "grid"
}
