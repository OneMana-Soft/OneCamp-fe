import { describe, expect, it } from "vitest"
import { columnsToHide } from "@/lib/table/fitColumns"

const ALL = ["task_name", "task_status", "task_priority", "task_project_name", "task_start_date", "task_due_date", "task_created_at"]

describe("columns that step aside in a narrow table", () => {
  it("hides nothing when everything fits, or before the width is known", () => {
    expect(columnsToHide(2000, ALL)).toEqual({})
    expect(columnsToHide(0, ALL)).toEqual({})
  })

  it("hides the least useful first", () => {
    expect(Object.keys(columnsToHide(900, ALL))).toEqual(["task_created_at"])
    expect(Object.keys(columnsToHide(750, ALL))).toEqual(["task_created_at", "task_start_date"])
  })

  it("never hides the title, status or due date", () => {
    const hidden = columnsToHide(100, ALL)
    for (const keep of ["task_name", "task_status", "task_due_date"]) expect(hidden).not.toHaveProperty(keep)
  })

  it("leaves alone a column the person chose to show", () => {
    expect(columnsToHide(750, ALL, { task_created_at: true })).not.toHaveProperty("task_created_at")
  })

  it("steps a project's own field columns aside first, the last first", () => {
    const withFields = [...ALL, "field_a", "field_b"]
    // The built-in columns want 985px; each field 120px more.
    expect(Object.keys(columnsToHide(1150, withFields))).toEqual(["field_b"])
    expect(Object.keys(columnsToHide(1000, withFields))).toEqual(["field_b", "field_a"])
    expect(Object.keys(columnsToHide(900, withFields))).toEqual(["field_b", "field_a", "task_created_at"])
  })

  it("counts a column the person hid as already gone", () => {
    expect(columnsToHide(900, ALL, { task_created_at: false })).toEqual({})
  })
})
