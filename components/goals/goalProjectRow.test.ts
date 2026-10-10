import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// On a phone a goal's project row squeezed the project's name to one word a
// line ("Q / 11 / of / 17 / tasks / done") beside its progress and health.
describe("a goal's project row", () => {
  const src = readFileSync("components/goals/GoalPage.tsx", "utf8")
  const row = src.slice(src.indexOf("function ProjectRow"), src.indexOf("function ProjectRow") + 2500)
  it("keeps its name at least 14rem wide before the rest wraps under it, with the project's mark", () => {
    expect(row).toContain("min-w-[min(100%,14rem)] flex-1")
    expect(row).toContain("<IdentityMark id={p.project_uuid}")
  })
})
