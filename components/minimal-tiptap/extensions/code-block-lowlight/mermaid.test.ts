import { describe, expect, it } from "vitest"
import { safeCss } from "./mermaid"

// A Mermaid diagram's own CSS stays (its look hangs on it), but nothing in
// it may fetch from elsewhere: the source is anyone's who can edit the doc.
describe("a diagram's CSS", () => {
  it("keeps its rules and its own #id references", () => {
    expect(safeCss("#d .node rect{fill:#fff;} .edge{marker-end:url(#d_arrow);}")).toBe("#d .node rect{fill:#fff;} .edge{marker-end:url(#d_arrow);}")
  })

  it("drops @import and any url() that leaves the diagram", () => {
    expect(safeCss('@import url("https://x.test/a.css"); .a{background:url(https://x.test/t.png)} .b{background:url( "//x.test/t" )}')).toBe(" .a{background:none} .b{background:none}")
  })
})

describe("the shared DOMPurify", () => {
  it("keeps a diagram's classes: the app's class filter is on its own instance (lib/sanitizeHtml)", async () => {
    const { sanitizeRichHtml } = await import("@/lib/sanitizeHtml")
    const DOMPurify = (await import("dompurify")).default
    // The app's sanitiser drops classes the editor doesn't write...
    expect(sanitizeRichHtml('<p class="fixed inset-0">x</p>')).toBe("<p>x</p>")
    // ...and Mermaid's own sanitising, through the shared instance, keeps them.
    expect(DOMPurify.sanitize('<svg><g class="node"><rect class="basic"></rect></g></svg>', { USE_PROFILES: { svg: true } })).toContain('class="node"')
  })
})
