import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

// Messages that need no editor are rendered as plain HTML (.static-rich), and
// their links carry no class. The editor's link style targeted a.link only, so
// every link in such a message read as plain text.
describe("links in statically rendered messages", () => {
  it("look like links", () => {
    const css = readFileSync(resolve(__dirname, "styles/partials/typography.css"), "utf8")
    expect(css).toMatch(/\.static-rich a\[href\]\s*\{[^}]*text-primary[^}]*underline/)
  })
})
