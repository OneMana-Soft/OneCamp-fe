import { describe, expect, it } from "vitest"
import { isSafeHref } from "./safeHref"

describe("isSafeHref", () => {
  it("allows web, email and phone links", () => {
    for (const href of [
      "https://example.com/a?b=1&c=2#d",
      "http://example.com",
      "HTTPS://EXAMPLE.COM",
      "mailto:sam@example.com?subject=Hi",
      "tel:+44 20 7946 0000",
      "https://example.com/?a=1&amp;b=2",
    ]) expect(isSafeHref(href), href).toBe(true)
  })

  it("allows the app's own paths, fragments, queries and relative links", () => {
    for (const href of [
      "/app/doc/d-1",
      "/app/channel/ch1/p1",
      "#notes",
      "?tab=files",
      "./notes",
      "../notes",
      "notes.html",
      "//cdn.example.com/a.png",
      "/search?q=javascript:alert(1)",
    ]) expect(isSafeHref(href), href).toBe(true)
  })

  it("refuses javascript: however it's written", () => {
    for (const href of [
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "JavaScript:alert(1)",
      "java\tscript:alert(1)",
      "java\nscript:alert(1)",
      "java\rscript:alert(1)",
      "\u0000javascript:alert(1)",
      "  javascript:alert(1)",
      "\u00a0javascript:alert(1)",
      "java\u200bscript:alert(1)",
      "javascript\u0001:alert(1)",
      // Character references, as they'd reach an href that is decoded again
      "java&#x09;script:alert(1)",
      "java&#9;script:alert(1)",
      "java&#x0A;script:alert(1)",
      "java&#x0D;script:alert(1)",
      "java&Tab;script:alert(1)",
      "java&NewLine;script:alert(1)",
      "&#106;avascript:alert(1)",
      "&#x6A;avascript:alert(1)",
      "&#106avascript:alert(1)",
      "javascript&colon;alert(1)",
      "javascript&#58;alert(1)",
      "java&amp;#x09;script:alert(1)",
      "java&amp;amp;#x09;script:alert(1)",
    ]) expect(isSafeHref(href), JSON.stringify(href)).toBe(false)
  })

  it("refuses every other scheme", () => {
    for (const href of [
      "vbscript:msgbox(1)",
      "VBScript:msgbox(1)",
      "vb&#x09;script:msgbox(1)",
      "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      "DATA:text/html,<script>alert(1)</script>",
      "da\tta:text/html,x",
      "file:///etc/passwd",
      "blob:https://example.com/0f9b",
      "ftp://example.com",
    ]) expect(isSafeHref(href), JSON.stringify(href)).toBe(false)
  })

  it("is not a link without an href", () => {
    expect(isSafeHref("")).toBe(false)
    expect(isSafeHref("   ")).toBe(false)
    expect(isSafeHref(null)).toBe(false)
    expect(isSafeHref(undefined)).toBe(false)
    expect(isSafeHref(42)).toBe(false)
  })

  it("stops on encoding nested past any real link's, cheaply", () => {
    const nested = "&amp;".repeat(1) + "amp;".repeat(5000) + "#x09;"
    const started = performance.now()
    expect(isSafeHref("java" + nested + "script:alert(1)")).toBe(false)
    expect(performance.now() - started).toBeLessThan(250)
  })
})
