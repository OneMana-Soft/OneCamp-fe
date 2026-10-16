import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// The docs page (D01; docs programme B5): one 1,040 px column with a title row
// and New doc; a tab already seen stays mounted (its cards, page and scroll
// stay); the list waits in its own shape while the opening tab is worked out;
// a phone gets rows, not cards, and its one "+" in the app bar.
const tabs = readFileSync("components/doc/docListTabs.tsx", "utf8")
const content = readFileSync("components/doc/docListTabContent.tsx", "utf8")
const card = readFileSync("components/doc/docCard.tsx", "utf8")
const boards = readFileSync("app/app/board/page.tsx", "utf8")

describe("the docs page", () => {
  it("is one 1,040 px column with New doc in its title row", () => {
    expect(tabs).toMatch(/max-w-\[1040px\]/)
    // With the space of the tab it is on (QA DSA-34: New doc on Workspace makes a workspace doc).
    expect(tabs).toMatch(/<NewDocButton space=\{newDocSpace\} \/>/)
    expect(tabs).toMatch(/text-title-1/)
  })

  it("keeps a tab it has shown mounted, hidden, instead of swapping components", () => {
    expect(content).toMatch(/DOC_TABS\.filter\(\(t\) => shown\[t\]\)/)
    expect(content).toMatch(/t === tab \? "flex" : "hidden"/)
    expect(content).not.toMatch(/switch \(tab\)/)
  })

  it("shows only the list's own shape until it knows which tab to open", () => {
    expect(tabs).toMatch(/chosen \? \(\s*<DocListTabContent/)
  })

  it("draws rows on a phone (64 px, the doc's icon on a tile), not two cramped cards", () => {
    expect(card).toMatch(/max-sm:h-16/)
    expect(card).toMatch(/data-doc-card/)
    // A page drawn 40 px wide was a blank white box.
    expect(card).toMatch(/<DocIcon icon=\{doc\.doc_icon\} size=\{20\} className="sm:hidden" \/>/)
    expect(card).not.toMatch(/compact/)
  })

  it("leaves the phone's one + to its app bar, on docs and on boards", () => {
    expect(tabs).toMatch(/max-sm:hidden/)
    expect(boards).toMatch(/className="shrink-0 gap-1\.5 max-sm:hidden"[^>]*>[\s\S]{0,200}New board/)
  })

  it("searches docs' bodies through the docs home's own search, never the old title-only lists", () => {
    expect(tabs).toMatch(/DocSearchResults/)
    expect(tabs + content).not.toMatch(/getPrivateDoc|getPublicDoc|searchPrivate|searchPublic/)
  })
})
