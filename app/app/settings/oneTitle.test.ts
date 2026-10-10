import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// One page, one title: the section's header names it, so the card under it
// drops its own. Workflows said "Workflows" twice.
const root = join(__dirname, "..", "..", "..")
const read = (f: string) => readFileSync(join(root, f), "utf8")

describe("a settings section names itself once", () => {
  it.each([
    ["app/app/settings/workflows/page.tsx", "components/admin/WorkflowsCard.tsx", "Workflows"],
  ])("%s", (page, card, name) => {
    expect(read(page)).toMatch(/<SectionHeader\s/)
    expect(read(page)).toMatch(/withTitle=\{false\}/)
    const src = read(card)
    // The card's own title is drawn only when it's asked for.
    // Either a guarded title, or a variant that returns before drawing one.
    const guarded = src.lastIndexOf("withTitle &&", src.indexOf(`>${name}<`)) > 0
    const earlyReturn = /if \(!withTitle\) \{[\s\S]{0,200}return/.test(src)
    expect(guarded || earlyReturn).toBe(true)
  })
})
