import type { ViewType } from "@/services/tableService"

/**
 * The ways a table can be shown. "chart" is the reader's own analytics view,
 * not a view saved on the server, so it is always there.
 */
export type ViewChoice = ViewType | "chart"

export const VIEW_CHOICES: readonly ViewChoice[] = ["grid", "board", "calendar", "chart"]

/** The view a link asked for (?view=board), or the grid for anything else. */
export function viewFromQuery(value: string | null | undefined): ViewChoice {
  return (VIEW_CHOICES as readonly string[]).includes(value ?? "") ? (value as ViewChoice) : "grid"
}
