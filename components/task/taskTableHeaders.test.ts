import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const read = (f: string) => readFileSync(f, "utf8")

describe("a task table's headers and its column menu", () => {
  it("pulls a right-aligned column's sort button to the right, so the header ends where its figures end", () => {
    // It ended 8px short of the dates under it.
    const src = read("components/task/taskTableColumnHeader.tsx")
    expect(src).toMatch(/right \? "-mr-2" : "-ml-2"/)
  })

  it("names columns in sentence case, not with CSS capitalize", () => {
    // "Start Date", "Created At" beside headers reading "Start date".
    for (const f of ["components/task/taskTableViewOptions.tsx", "components/myTask/myTaskKanban.tsx", "components/project/projectTaskKanban.tsx"]) {
      expect(read(f), f).not.toMatch(/["\s]capitalize["\s]/)
    }
  })

  it("keeps View at every width", () => {
    expect(read("components/task/taskTableViewOptions.tsx")).not.toContain("lg:flex")
  })
})
