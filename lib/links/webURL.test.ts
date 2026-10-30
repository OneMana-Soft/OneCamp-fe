import { describe, expect, it } from "vitest"
import { typedWebURL, webURL } from "./webURL"
import { cellValid, safeHref } from "@/lib/tables/cellFormat"

// One reader of a web address for the web, as helpers.WebLink is the server's.
describe("a web address", () => {
  it("is http or https to a host, and nothing else", () => {
    expect(webURL(" https://example.com/thanks ")?.href).toBe("https://example.com/thanks")
    expect(webURL("HTTP://Example.com")?.host).toBe("example.com")
    for (const s of ["", "example.com", "/thanks", "https://", "mailto:team@example.com", "javascript:alert(1)", "ftp://example.com"]) expect(webURL(s), s).toBeNull()
  })

  it("as people type it, may leave https:// off, and is never another kind of address", () => {
    expect(typedWebURL("example.com/page")?.href).toBe("https://example.com/page")
    expect(typedWebURL("example.com:8080/board")?.href).toBe("https://example.com:8080/board")
    expect(typedWebURL("http://intranet.example/x")?.href).toBe("http://intranet.example/x")
    expect(typedWebURL("https://user:pass@example.com")?.username).toBe("user")
    // An address in its query is still one address, https:// left off.
    expect(typedWebURL("example.com/r?to=https://x.com")?.host).toBe("example.com")
    for (const s of ["", "  ", "mailto:team@example.com", "team@example.com", "javascript:alert(1)", "tel:+15550100", "ftp://files.example.com", "file:///etc/passwd", "a b.com"]) expect(typedWebURL(s), s).toBeNull()
  })

  it("is what a table's URL cell takes and links to, a host with a dot", () => {
    expect(cellValid("url", "example.com/page")).toBe(true)
    expect(cellValid("url", "example.com:8080")).toBe(true)
    expect(cellValid("url", "localhost:3000")).toBe(false)
    expect(cellValid("url", "team@example.com")).toBe(false)
    expect(cellValid("url", "")).toBe(true)
    expect(safeHref("example.com/page")).toBe("https://example.com/page")
    expect(safeHref("javascript:alert(1)")).toBeNull()
    expect(safeHref("mailto:team@example.com")).toBeNull()
    expect(safeHref("  ")).toBeNull()
  })
})
