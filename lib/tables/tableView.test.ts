import { describe, expect, it } from "vitest"
import { rowsView, viewFromQuery } from "./tableView"

describe("the view a table link asks for", () => {
  it("opens the view the address names", () => {
    expect(viewFromQuery("board")).toBe("board")
    expect(viewFromQuery("calendar")).toBe("calendar")
    expect(viewFromQuery("chart")).toBe("chart")
    // B4's layouts
    expect(viewFromQuery("gallery")).toBe("gallery")
    expect(viewFromQuery("list")).toBe("list")
  })

  it("opens the grid for no view, or one it does not know", () => {
    expect(viewFromQuery(null)).toBe("grid")
    expect(viewFromQuery("")).toBe("grid")
    expect(viewFromQuery("form")).toBe("grid")
  })
})

describe("the layouts that show the rows as the grid holds them", () => {
  it("are the grid, the gallery and the list: the server's windows, colours and fields shown", () => {
    for (const v of ["grid", "gallery", "list"] as const) expect(rowsView(v), v).toBe(true)
    for (const v of ["board", "calendar", "chart"] as const) expect(rowsView(v), v).toBe(false)
  })
})
