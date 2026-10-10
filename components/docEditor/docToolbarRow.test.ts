import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const src = readFileSync("components/docEditor/docInput.tsx", "utf8")

describe("the doc's formatting row", () => {
  it("puts bold first, as every editor does", () => {
    expect(src).toMatch(/SECTION_2_ACTIONS[^=]*= \['bold', 'italic', 'underline', 'strikethrough', 'code'/)
  })

  it("drops its two buttons' words where it has no room, keeping their names", () => {
    expect(src).toMatch(/@container\/toolbar/)
    expect(src).toMatch(/TOOLBAR_LABEL = "hidden @\[\d+rem\]\/toolbar:inline"/)
    expect(src).toMatch(/aria-label="Insert image"/)
    expect(src).toMatch(/aria-label=\{hasSelection \? "Rewrite with AI" : "Write with AI"\}/)
  })
})

describe("a doc on a phone", () => {
  const view = readFileSync("components/views/DocView.tsx", "utf8")
  it("adds no bar of its own under the app bar unless someone else is here", () => {
    expect(view).toMatch(/isMobile && awarenessUsers\.length > 1 &&/)
    const phoneRow = view.slice(view.indexOf("data-doc-presence-row"), view.indexOf("data-doc-presence-row") + 300)
    expect(phoneRow).not.toMatch(/DocTopBarBreadcrumb/)
  })
})
