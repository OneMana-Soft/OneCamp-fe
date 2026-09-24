import { describe, expect, it } from "vitest"
import { defaultDocTab } from "./docTab"

describe("defaultDocTab", () => {
  it("honours a tab named in the URL", () => {
    expect(defaultDocTab("public", 5)).toBe("public")
    expect(defaultDocTab("private", 0)).toBe("private")
  })
  it("opens the team's docs when there is nothing private", () => {
    expect(defaultDocTab(null, 0)).toBe("public")
  })
  it("opens Private when it has docs, or while it is still loading", () => {
    expect(defaultDocTab(null, 3)).toBe("private")
    expect(defaultDocTab(null, undefined)).toBe("private")
    expect(defaultDocTab("nonsense", 2)).toBe("private")
  })
})
