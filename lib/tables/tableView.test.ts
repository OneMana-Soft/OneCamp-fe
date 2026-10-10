import { describe, expect, it } from "vitest"
import { viewFromQuery } from "./tableView"

describe("the view a table link asks for", () => {
  it("opens the view the address names", () => {
    expect(viewFromQuery("board")).toBe("board")
    expect(viewFromQuery("calendar")).toBe("calendar")
    expect(viewFromQuery("chart")).toBe("chart")
  })

  it("opens the grid for no view, or one it does not know", () => {
    expect(viewFromQuery(null)).toBe("grid")
    expect(viewFromQuery("")).toBe("grid")
    expect(viewFromQuery("gantt")).toBe("grid")
  })
})
