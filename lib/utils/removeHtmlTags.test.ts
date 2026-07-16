import { describe, expect, it } from "vitest"
import { removeHtmlTags, decodeHtmlEntities } from "./removeHtmlTags"

describe("removeHtmlTags", () => {
  it("returns empty string for null/undefined/empty", () => {
    expect(removeHtmlTags(null)).toBe("")
    expect(removeHtmlTags(undefined)).toBe("")
    expect(removeHtmlTags("")).toBe("")
  })

  it("strips HTML tags", () => {
    expect(removeHtmlTags("<p>hello <strong>world</strong></p>")).toBe("hello world")
  })

  it("decodes the numeric entities seen in the activity feed", () => {
    // The exact bug: apostrophe (&#39;) and double-quote (&#34;) shown raw.
    expect(removeHtmlTags("<p>Here&#39;s the &#34;summary&#34;</p>")).toBe(`Here's the "summary"`)
  })

  it("decodes hex numeric entities", () => {
    expect(removeHtmlTags("&#x27;quoted&#x22;")).toBe(`'quoted"`)
  })

  it("decodes common named entities (nbsp becomes a regular space)", () => {
    expect(removeHtmlTags("Tom &amp; Jerry &lt;3 &nbsp;done")).toBe("Tom & Jerry <3  done")
  })

  it("leaves unknown named entities untouched", () => {
    expect(removeHtmlTags("a &notarealentity; b")).toBe("a &notarealentity; b")
  })

  it("is a near no-op on already-plain text", () => {
    expect(removeHtmlTags("just text")).toBe("just text")
  })

  it("does not parse decoded markup as HTML (XSS-safe: returns literal text)", () => {
    // &lt;script&gt; decodes to a literal string, never an executable tag.
    expect(decodeHtmlEntities("&lt;script&gt;alert(1)&lt;/script&gt;")).toBe("<script>alert(1)</script>")
  })
})
