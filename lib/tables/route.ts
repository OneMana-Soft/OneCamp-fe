import { app_tables_path } from "@/types/paths"

// The web app's one rule for links into tables (tables programme, PROGRAM.md
// §5): the tables list, a table, a row of it and a view of it, for every link
// builder (relation chips, doc embeds, templates, the admin's guest list, the
// Markdown export, the list itself). A5, B3 and B7 add bases, saved views and
// interface pages here when they exist.

/** The tables list. */
export function tablesPath(): string {
  return app_tables_path
}

/** What a link into a table opens beside the table itself. */
export interface TableTarget {
  /** A row, opened in its record. */
  row?: string
  /** A view other than the grid ("board", "calendar", "chart"). */
  view?: string
  /** A table AI just made, which says so on the page (TAB-BUG-6). */
  made?: "ai"
  /** A thread on the row, which its record opens at (with row). */
  thread?: string
}

/**
 * Where a table opens: /app/tables/<id>, with the row its record shows, the
 * view it's in and how it was made as query parameters, each encoded. Pure.
 */
export function tablePath(tableId: string, to: TableTarget = {}): string {
  const query = new URLSearchParams()
  if (to.view) query.set("view", to.view)
  if (to.row) query.set("row", to.row)
  if (to.made) query.set("made", to.made)
  if (to.row && to.thread) query.set("thread", to.thread)
  const q = query.toString()
  return `${app_tables_path}/${encodeURIComponent(tableId)}${q ? `?${q}` : ""}`
}
