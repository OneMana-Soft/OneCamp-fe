import { describe, expect, it } from "vitest"
import { linksAsHosts } from "@/lib/links/hostOf"

// Home says meeting titles on screens people share, and a pasted link can
// carry the meeting's password (?pwd=), so every web link in one reads as its
// host (CR-27, 24 Oct 2026).
describe("linksAsHosts", () => {
  it("says each web link in the text as its host, and keeps the words around it", () => {
    expect(linksAsHosts("Standup https://zoom.us/j/1?pwd=x")).toBe("Standup zoom.us")
    expect(linksAsHosts("https://www.zoom.us/j/1?pwd=x or http://meet.example.com/a")).toBe("zoom.us or meet.example.com")
    expect(linksAsHosts("Sync:HTTPS://Zoom.us/j/1?pwd=x")).toBe("Sync:zoom.us")
    expect(linksAsHosts("Standup https://name:secret@zoom.us/j/1")).toBe("Standup zoom.us")
  })

  // Main (24 Oct, CR-29's nit): a link pasted without its scheme carries the password just the same.
  it("says a link with no scheme as its host, when a path or query shows it is one", () => {
    expect(linksAsHosts("zoom.us/j/1?pwd=x")).toBe("zoom.us")
    expect(linksAsHosts("Standup www.zoom.us/j/1?pwd=x, then plan")).toBe("Standup zoom.us, then plan")
    expect(linksAsHosts("Sync (meet.example.com:8443/abc?pwd=1).")).toBe("Sync (meet.example.com).")
    expect(linksAsHosts("Call us.zoom.us?pwd=x")).toBe("Call us.zoom.us")
  })

  it("leaves words with a dot in them as they are", () => {
    for (const words of ["Ship v2.0 today", "Plan, e.g. the launch", "Read report.pdf", "Is it zoom.us?", "Ask a@b.co/x", "Node.js day", "Q3.1/Q3.2 review"])
      expect(linksAsHosts(words)).toBe(words)
  })

  // The one matcher (lib/links/webLink) also takes a bare host on a common domain: it reads as itself,
  // less any "www." (CR-33's SF on b074e93af). A bare host on any other domain stays a word.
  it("says a bare host on a common domain as itself, and leaves other bare hosts as words", () => {
    expect(linksAsHosts("Review on github.com today")).toBe("Review on github.com today")
    expect(linksAsHosts("Review on www.github.com today")).toBe("Review on github.com today")
    for (const words of ["Ship v2.0 today", "Read report.pdf", "Meet on zoom.us"]) expect(linksAsHosts(words)).toBe(words)
  })

  it("keeps the punctuation after a link", () => {
    expect(linksAsHosts("Standup (https://zoom.us/j/1?pwd=x).")).toBe("Standup (zoom.us).")
    expect(linksAsHosts("Join https://zoom.us/j/1?pwd=x, then plan")).toBe("Join zoom.us, then plan")
  })

  it("leaves text with no web link as it is", () => {
    expect(linksAsHosts("Design review")).toBe("Design review")
    expect(linksAsHosts("mailto:a@b.co, ftp://files.example.com/x")).toBe("mailto:a@b.co, ftp://files.example.com/x")
    // An untitled event's title, which the API leaves out.
    expect(linksAsHosts(undefined)).toBe("")
  })
})
