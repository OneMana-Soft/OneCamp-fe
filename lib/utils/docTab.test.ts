import { describe, expect, it } from "vitest"
import { DOC_TABS, DOC_TAB_LABEL, defaultDocTab, tabFromAddress, tabTools } from "./docTab"

describe("the docs home's tabs (B5)", () => {
  it("are Recent, Mine, Shared with me, Workspace, Starred and Archived, in sentence case", () => {
    expect(DOC_TABS.map((t) => DOC_TAB_LABEL[t])).toEqual(["Recent", "Mine", "Shared with me", "Workspace", "Starred", "Archived"])
  })

  it("honour a tab named in the address, an old address's Private and Public included", () => {
    expect(defaultDocTab("shared", 5)).toBe("shared")
    expect(defaultDocTab("archived", 0)).toBe("archived")
    expect(tabFromAddress("private")).toBe("mine")
    expect(tabFromAddress("public")).toBe("workspace")
    expect(tabFromAddress("nonsense")).toBeNull()
  })

  it("open Recent, or the team's docs for someone who hasn't opened one yet", () => {
    expect(defaultDocTab(null, 3)).toBe("recent")
    expect(defaultDocTab(null, undefined)).toBe("recent")
    expect(defaultDocTab(null, 0)).toBe("workspace")
    expect(defaultDocTab("nonsense", 0)).toBe("workspace")
  })

  it("sort and filter only the lists that have an order of their own to change", () => {
    expect(tabTools("recent")).toEqual({ sort: false, owner: false, space: false })
    expect(tabTools("starred")).toEqual({ sort: false, owner: false, space: false })
    expect(tabTools("mine")).toEqual({ sort: true, owner: false, space: true })
    expect(tabTools("workspace")).toEqual({ sort: true, owner: true, space: true })
  })
})
