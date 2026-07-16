import { describe, expect, it } from "vitest"
import { htmlToPreviewText } from "./htmlToPreviewText"

describe("htmlToPreviewText", () => {
  it("returns empty string for undefined/empty", () => {
    expect(htmlToPreviewText(undefined)).toBe("")
    expect(htmlToPreviewText("")).toBe("")
  })

  it("strips tags to plain text", () => {
    expect(htmlToPreviewText("<p>hello <strong>world</strong></p>")).toBe("hello world")
  })

  it("joins block-level elements with a space (no word run-together)", () => {
    expect(htmlToPreviewText("<p>first</p><p>second</p>")).toBe("first second")
  })

  it("treats <br> as a space", () => {
    expect(htmlToPreviewText("line one<br>line two")).toBe("line one line two")
    expect(htmlToPreviewText("line one<br/>line two")).toBe("line one line two")
  })

  it("decodes the common entities the editor emits", () => {
    expect(htmlToPreviewText("<p>Tom &amp; Jerry &lt;3&gt; &quot;hi&quot; it&#39;s</p>")).toBe(
      `Tom & Jerry <3> "hi" it's`,
    )
  })

  it("collapses runs of whitespace and trims", () => {
    expect(htmlToPreviewText("<p>  a   b  </p>")).toBe("a b")
    expect(htmlToPreviewText("a&nbsp;&nbsp;b")).toBe("a b")
  })

  it("caps long text and appends an ellipsis", () => {
    const long = "x".repeat(200)
    const out = htmlToPreviewText(`<p>${long}</p>`, 20)
    expect(out.endsWith("…")).toBe(true)
    // 20 chars + the ellipsis
    expect(out.length).toBe(21)
  })

  it("does not append an ellipsis when within the cap", () => {
    expect(htmlToPreviewText("<p>short</p>", 20)).toBe("short")
  })

  it("is a near no-op on already-plain text", () => {
    expect(htmlToPreviewText("just text")).toBe("just text")
  })

  it("renders decoded markup as literal text (never re-parsed as HTML)", () => {
    // A body that contained an escaped tag decodes to a literal string; the
    // output is plain text used as a label, never injected as HTML.
    expect(htmlToPreviewText("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>")).toBe(
      "<script>alert(1)</script>",
    )
  })
})
