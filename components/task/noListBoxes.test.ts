import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * No boxes around lists (design v3, work.md §1.6.6): the project list and My
 * Tasks sit on the sheet with no pagination and no bordered table; rows are
 * 40 px, group headers 36 px and the toolbar 44 px.
 */
const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8")

describe("lists without boxes", () => {
  it.each(["components/project/projectTaskTable.tsx", "components/myTask/myTaskTable.tsx"])("%s has no pagination and no bordered table", (f) => {
    const src = read(f)
    expect(src).not.toMatch(/TaskTablePagination/)
    expect(src).not.toMatch(/rounded-md border/)
    expect(src).not.toMatch(/<Table\b/)
    expect(src).toMatch(/<GroupedTaskList/)
  })

  it("holds the rhythm: 40 px rows, 36 px group headers, a 44 px toolbar", () => {
    expect(read("components/task/GroupedTaskList.tsx")).toMatch(/export const ROW_H = "h-10"/)
    expect(read("components/task/GroupedTaskList.tsx")).toMatch(/export const GROUP_H = "h-9"/)
    expect(read("components/task/WorkToolbar.tsx")).toMatch(/export const TOOLBAR_H = "h-11"/)
  })
})

describe("the one-line toolbar (work.md W10)", () => {
  const src = read("components/task/WorkToolbar.tsx")
  const toolbar = src.slice(src.indexOf("export function WorkToolbar"), src.indexOf("function FacetSub"))
  it("has New task as its one primary and no bordered buttons", () => {
    expect(toolbar).not.toMatch(/variant="outline"/)
    // Every Button in the bar is ghost except the primary New task (no variant).
    const buttons = [...toolbar.matchAll(/<Button\b([^>]*)>/g)].map((m) => m[1])
    expect(buttons.filter((b) => !/variant=/.test(b))).toHaveLength(1)
    expect(toolbar).toMatch(/New task<\/span>\s*<span className="kbd/)
  })
})
