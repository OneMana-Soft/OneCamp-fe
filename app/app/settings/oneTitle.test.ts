import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// One page, one title: the section's header names it, so the card under it
// drops its own. Workflows said "Workflows" twice, and "Your AI assistants"
// said its name twice, the second time in a bordered box of its own.
const root = join(__dirname, "..", "..", "..")
const read = (f: string) => readFileSync(join(root, f), "utf8")

describe("a settings section names itself once", () => {
  it.each([
    ["app/app/settings/workflows/page.tsx", "components/admin/WorkflowsCard.tsx", "Workflows"],
    ["app/app/settings/assistants/page.tsx", "components/ai/MyAssistantsCard.tsx", "Your AI assistants"],
  ])("%s", (page, card, name) => {
    expect(read(page)).toMatch(/<SectionHeader /)
    expect(read(page)).toMatch(/withTitle=\{false\}/)
    const src = read(card)
    // The card's own title is drawn only when it's asked for.
    const title = src.indexOf(`${name}\n`) >= 0 ? src.lastIndexOf("withTitle &&", src.indexOf(name)) : src.lastIndexOf("withTitle &&", src.indexOf(`>${name}<`))
    expect(title).toBeGreaterThan(0)
  })
})
