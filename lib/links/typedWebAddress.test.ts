import { describe, expect, it } from "vitest"
import { typedWebAddress } from "./typedWebAddress"

// What a link field sends (V-205): people paste a site as they see it, often without https://.
describe("a web address as typed, on its way to the server", () => {
  it("gains https:// when people leave it off", () => {
    expect(typedWebAddress(" github.com/acme/site ")).toBe("https://github.com/acme/site")
    expect(typedWebAddress("www.figma.com/file/q4")).toBe("https://www.figma.com/file/q4")
    expect(typedWebAddress("example.com:8080/board")).toBe("https://example.com:8080/board")
  })

  it("goes as typed otherwise, so the server's words answer it", () => {
    expect(typedWebAddress("https://www.figma.com/file/q4")).toBe("https://www.figma.com/file/q4")
    expect(typedWebAddress(" HTTP://Intranet.example/x ")).toBe("HTTP://Intranet.example/x")
    for (const s of ["", "mailto:team@example.com", "team@example.com", "ftp://files.example.com", "javascript:alert(1)", "a b.com"]) expect(typedWebAddress(s), s).toBe(s)
  })
})
