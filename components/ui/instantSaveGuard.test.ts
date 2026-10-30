import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

// design-14, item 2: every change saved with a tick and undo. These lists'
// switches saved with no tick and no way back. Each is an InstantSwitch now,
// or, where the row asks first (pausing an agent), a Switch inside SwitchTick
// whose row runs its save with an offer.
const LISTS = [
  "components/admin/WebhooksCard.tsx",
  "components/admin/AppsCard.tsx",
  "components/admin/McpServersCard.tsx",
  "components/admin/DataSourcesCard.tsx",
  "components/admin/AgentsCard.tsx",
  "components/admin/AgentInventoryCard.tsx",
  "components/admin/ai/AuthorizedModelsSection.tsx",
]

describe("a list's switch", () => {
  it("saves with its tick and Undo in every list that had a bare one", () => {
    const bare = LISTS.filter((f) => {
      const src = readFileSync(join(process.cwd(), f), "utf8")
      return (src.match(/<Switch\b/g)?.length ?? 0) !== (src.match(/<SwitchTick\b/g)?.length ?? 0)
    })
    expect(bare).toEqual([])
  })

  it("offers a pause back when the row asks before it pauses", () => {
    const src = readFileSync(join(process.cwd(), "components/admin/AgentInventoryCard.tsx"), "utf8")
    expect(src).toMatch(/run\(\(\) => onToggle\(a, next\), \{\s*what:/)
  })
})

// design-14, item 2, second part: sixteen settings saves ticked with no way
// back. A save run through useSaveStatus now offers itself back, wherever it
// runs, so the next card can't forget.
describe("a save that ticks", () => {
  it("offers the change back in every file that runs one", () => {
    const sources = ["components", "app"].flatMap((dir) =>
      readdirSync(join(process.cwd(), dir), { recursive: true, encoding: "utf8" })
        .filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."))
        .map((f) => join(dir, f)),
    )
    const bare = sources.filter((f) => {
      const src = readFileSync(join(process.cwd(), f), "utf8")
      if (!/=\s*useSaveStatus\(\)/.test(src)) return false
      const saves = src.match(/\b(?:run|runMode)\(/g)?.length ?? 0
      const offers = src.match(/\bswitchOffer\(|\bundo: /g)?.length ?? 0
      return saves !== offers
    })
    expect(bare).toEqual([])
  })
})
