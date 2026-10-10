import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// Switching the docs tabs keeps a tab already seen mounted (its cards, page and
// scroll stay), the list waits in the cards' shape while the default tab is
// worked out, and a phone gets one "+" (its app bar's), not a second by the tabs.
const tabs = readFileSync("components/doc/docListTabs.tsx", "utf8")
const content = readFileSync("components/doc/docListTabContent.tsx", "utf8")
const boards = readFileSync("app/app/board/page.tsx", "utf8")

describe("the docs list's tabs", () => {
  it("keeps a tab it has shown mounted, hidden, instead of swapping components", () => {
    expect(content).toMatch(/seen\.has\("private"\)/)
    expect(content).toMatch(/seen\.has\("public"\)/)
    expect(content).not.toMatch(/switch \(selectedTab\)/)
  })

  it("shows only the cards' shape until it knows which tab to open", () => {
    expect(tabs).toMatch(/chosen \? <DocListTabContent/)
  })

  it("leaves the phone's one + to its app bar, on docs and on boards", () => {
    expect(tabs).toMatch(/aria-label="New doc"\s+className="max-sm:hidden"/)
    expect(boards).toMatch(/className="shrink-0 gap-1\.5 max-sm:hidden"[^>]*>\s*\{isSubmitting/)
  })
})
