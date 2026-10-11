import { afterEach, describe, expect, it } from "vitest"

import { celebrateCamp, hasCelebrated } from "@/lib/celebrate"

afterEach(() => window.localStorage.clear())

/** The Camp tier happens once per person per project or goal, remembered (work.md W04). */
describe("the Camp tier", () => {
  it("fires once, then never again for the same thing", () => {
    expect(hasCelebrated("project", "p-1")).toBe(false)
    expect(celebrateCamp(null, "project", "p-1")).toBe(true)
    expect(window.localStorage.getItem("oc_celebrated:project:p-1")).toBe("1")
    expect(celebrateCamp(null, "project", "p-1")).toBe(false)
    expect(celebrateCamp(null, "goal", "p-1")).toBe(true)
  })
})
