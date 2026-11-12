import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { chainOf, walk } from "../scripts/fluidity/reach.mjs"

// A project's Releases tab (P10-1b web) is in both tab registries, and its
// view is a chunk of its own: neither registry imports it, and it imports
// none of the shared core, which would re-cut every route's chunks (main's
// chunking rule, 30 Oct). The page hands it the HTTP client and the shared
// states instead (components/work/releases/ReleasesTab).
const REGISTRIES = ["components/project/projectTaskDesktop.tsx", "components/project/projectListTabs.tsx"]
const TAB = "components/work/releases/ReleasesTab.tsx"
const VIEW = [
  "components/work/releases/ProjectReleases.tsx",
  "components/work/releases/ReleaseSheet.tsx",
  "components/work/releases/releaseParts.tsx",
  // jira-04: the sheet's Burndown view and the part it shares with the cycle burndown.
  "components/work/releases/ReleaseBurndown.tsx",
  "components/charts/BurndownPart.tsx",
  // jira-04 part 4: Mark released's drawer, and the choice it shares with Complete cycle.
  "components/work/releases/ShipRelease.tsx",
  "components/work/carryChoice.tsx",
]
const CORE = [
  "lib/axiosInstance.ts",
  "hooks/useFetch.ts",
  "hooks/useClientConfig.ts",
  "hooks/use-toast.ts",
  "components/ui/error-state.tsx",
  "components/ui/empty-state.tsx",
  "components/ui/graphics/index.ts",
  "store/store.ts",
]

const reach = (entries: string[], targets: string[]) => {
  const { files } = walk(entries) as { files: Map<string, string | null> }
  return targets.filter((p) => files.has(p)).map((p) => `${p}: ${chainOf(files, p)}`)
}

describe("the Releases tab", () => {
  it("is in both registries", () => {
    for (const r of REGISTRIES) expect(reach([r], [TAB]).length, r).toBe(1)
    expect(readFileSync("components/project/projectTaskDesktop.tsx", "utf8")).toMatch(/VALID_TABS = \[[^\]]*"releases"/)
  })

  it("loads its view when opened: no registry imports it", () => {
    expect(reach([...REGISTRIES, TAB], VIEW)).toEqual([])
  })

  it("whose view reaches none of the shared core", () => {
    expect(reach(VIEW, CORE)).toEqual([])
  })

  it("would see one: the tab's own shell, walked from, brings the shared core", () => {
    expect(reach([TAB], ["lib/axiosInstance.ts"]).length).toBe(1)
  })
})

// jira-04 part 4: Mark released asks what becomes of the unfinished tasks in a drawer of its own, which comes
// with the release's sheet (never on a route's first load) and reaches none of the shared core.
describe("Mark released's drawer", () => {
  const SHIP = "components/work/releases/ShipRelease.tsx"
  const CARRY = "components/work/carryChoice.tsx"
  it("comes with the release's sheet, which imports it and the choice Complete cycle shares", () => {
    expect(existsSync(SHIP) && existsSync(CARRY)).toBe(true)
    expect(reach(["components/work/releases/ReleaseSheet.tsx"], [SHIP, CARRY]).length).toBe(2)
    expect(reach(["components/work/backlog/CompleteCycleDialog.tsx"], [CARRY]).length).toBe(1)
  })

  it("reaches none of the shared core", () => {
    expect(existsSync(SHIP)).toBe(true)
    expect(reach([SHIP, CARRY], CORE)).toEqual([])
  })
})

// jira-04 R9 cut: a list's toolbar draws the Release facet's trigger and, with a release chosen, its chip; the
// facet's list, the chip's words and the read behind them are a chunk of their own (components/task/releaseFacet),
// loaded when the Filter opens or a release is chosen, which imports none of the shared core.
describe("the Release filter on a list's toolbar", () => {
  const FACET = "components/task/releaseFacet.tsx"
  it("loads its list when the Filter opens: the toolbar imports neither it nor the releases' code", () => {
    expect(existsSync(FACET)).toBe(true)
    expect(reach(["components/task/WorkToolbar.tsx"], [FACET, "lib/work/releaseFilter.ts", "lib/work/releases.ts"])).toEqual([])
  })

  it("whose list reaches none of the shared core", () => {
    expect(existsSync(FACET)).toBe(true)
    expect(reach([FACET], CORE)).toEqual([])
  })
})

// The task panel's Release row (components/task/taskReleaseField) is a lazy part of its own: it takes the panel's
// HTTP client and toast, as the Releases tab and the Release facet take the page's, and reaches none of the shared core.
describe("the task panel's Release row", () => {
  it("reaches none of the shared core: the panel hands it its client and toast", () => {
    expect(reach(["components/task/taskReleaseField.tsx"], CORE)).toEqual([])
  })
})
