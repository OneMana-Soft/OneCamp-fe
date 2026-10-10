import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// The channel members dialog's AI sections were bordered, rounded boxes inside
// the dialog: a card in a card, twice. They are rows between hairlines.
describe("the members dialog's AI sections", () => {
  it.each([
    ["channelAITeammates.tsx", "data-ai-teammates"],
    ["channelAIBudget.tsx", "data-ai-budget"],
  ])("%s draws no box of its own", (file, marker) => {
    const src = readFileSync(join(__dirname, file), "utf8")
    const tag = src.slice(src.indexOf(marker), src.indexOf(">", src.indexOf(marker)))
    expect(tag).toContain("border-y")
    expect(tag).not.toMatch(/rounded-xl|\bborder border-border/)
  })
})
