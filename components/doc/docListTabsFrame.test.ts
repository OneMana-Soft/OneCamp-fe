import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// The docs page (D01): one 1,040 px column with a title row and a primary New
// doc; a tab already seen stays mounted (its cards, page and scroll stay); the
// list waits in the cards' shape while the default tab is worked out; a phone
// gets rows, not cards, and its one "+" in the app bar.
const tabs = readFileSync("components/doc/docListTabs.tsx", "utf8")
const content = readFileSync("components/doc/docListTabContent.tsx", "utf8")
const card = readFileSync("components/doc/docCard.tsx", "utf8")
const boards = readFileSync("app/app/board/page.tsx", "utf8")

describe("the docs page", () => {
  it("is one 1,040 px column with a primary New doc in its title row", () => {
    expect(tabs).toMatch(/max-w-\[1040px\]/)
    expect(tabs).toMatch(/<Button size="sm"[\s\S]*?<Plus[\s\S]*?New doc/)
    expect(tabs).toMatch(/text-title-1/)
  })

  it("keeps a tab it has shown mounted, hidden, instead of swapping components", () => {
    expect(content).toMatch(/seen\.has\("private"\)/)
    expect(content).toMatch(/seen\.has\("public"\)/)
    expect(content).not.toMatch(/switch \(selectedTab\)/)
  })

  it("shows only the cards' shape until it knows which tab to open", () => {
    expect(tabs).toMatch(/chosen \? \(\s*<DocListTabContent/)
  })

  it("draws rows on a phone (64 px, a small page), not two cramped cards", () => {
    expect(card).toMatch(/max-sm:h-16/)
    expect(card).toMatch(/data-doc-card/)
  })

  it("leaves the phone's one + to its app bar, on docs and on boards", () => {
    expect(tabs).toMatch(/max-sm:hidden/)
    expect(boards).toMatch(/className="shrink-0 gap-1\.5 max-sm:hidden"[^>]*>[\s\S]{0,200}New board/)
  })
})
