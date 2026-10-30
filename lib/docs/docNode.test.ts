import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { checkLinkUrl, holdsChildren, isPageKind, linkProvider, linkSite, openingOf } from "./docNode"

// Each link's family, held to the fixture the server's (domain/Doc LinkFamily)
// is held to, copied byte for byte into testdata/linkfamily.
const FAMILIES = path.join(__dirname, "..", "..", "testdata", "linkfamily", "links.json")
const families = JSON.parse(readFileSync(FAMILIES, "utf8")) as { url: string; family: string }[]

// What a node of the doc tree is and does (docs F1): only pages and folders
// hold others (D-30), each kind opens its own way, and a link is https only,
// checked as the server checks it.

describe("a node's kind", () => {
  it("is a page when it has none", () => {
    expect(isPageKind(undefined)).toBe(true)
    expect(isPageKind("folder")).toBe(false)
  })

  it("holds others only as a page or a folder", () => {
    expect([undefined, "folder", "file", "link"].map((k) => holdsChildren(k as never))).toEqual([true, true, false, false])
  })

  it("opens a page in the editor, a folder in place, a file in its preview and a link in a new tab", () => {
    expect([undefined, "folder", "file", "link"].map((k) => openingOf(k as never))).toEqual(["editor", "folder", "preview", "external"])
  })
})

describe("a link's address", () => {
  it("takes an https link as it is", () => {
    expect(checkLinkUrl(" https://docs.google.com/document/d/abc/edit ")).toEqual({ ok: true, url: "https://docs.google.com/document/d/abc/edit" })
  })

  it("takes one typed without a scheme as https", () => {
    expect(checkLinkUrl("figma.com/file/xyz")).toEqual({ ok: true, url: "https://figma.com/file/xyz" })
  })

  it("refuses http, other schemes, and script hidden in one", () => {
    expect(checkLinkUrl("http://example.com")).toEqual({ ok: false, problem: "Only https:// links can be added." })
    expect(checkLinkUrl("javascript:alert(1)")).toMatchObject({ ok: false })
    expect(checkLinkUrl("java\tscript:alert(1)")).toMatchObject({ ok: false })
    expect(checkLinkUrl("ftp://files.example.com")).toEqual({ ok: false, problem: "That isn't a web link." })
  })

  it("refuses an empty field, spaces, a host with no site and a password in the link", () => {
    expect(checkLinkUrl("  ")).toEqual({ ok: false, problem: "Paste a link." })
    expect(checkLinkUrl("https://exa mple.com")).toEqual({ ok: false, problem: "A link has no spaces in it." })
    expect(checkLinkUrl("https://localhost/x")).toEqual({ ok: false, problem: "That link has no site in it." })
    expect(checkLinkUrl("https://sam:secret@example.com")).toEqual({ ok: false, problem: "Take the name and password out of the link." })
  })
})

describe("a link's site and provider", () => {
  it("names the site without www", () => {
    expect(linkSite("https://www.figma.com/file/1")).toBe("figma.com")
    expect(linkSite("not a url")).toBe("")
  })

  it("knows the documents people link to most, by what they are", () => {
    const of = (u: string) => {
      const p = linkProvider(u)
      return `${p.name}:${p.family}`
    }
    expect(of("https://docs.google.com/document/d/1/edit")).toBe("Google Docs:doc")
    expect(of("https://docs.google.com/spreadsheets/d/1/edit")).toBe("Google Sheets:sheet")
    expect(of("https://docs.google.com/presentation/d/1/edit")).toBe("Google Slides:slides")
    expect(of("https://drive.google.com/file/d/1/view")).toBe("Google Drive:drive")
    expect(of("https://onedrive.live.com/?id=1")).toBe("OneDrive:drive")
    expect(of("https://acme.sharepoint.com/:x:/r/sites/q4.xlsx")).toBe("Excel:sheet")
    expect(of("https://www.figma.com/file/abc")).toBe("Figma:design")
    expect(of("https://github.com/onecamp/web")).toBe("GitHub:code")
    expect(of("https://youtu.be/abcdefghijk")).toBe("YouTube:video")
  })

  it("calls any other site by its name", () => {
    expect(linkProvider("https://www.example.org/guide")).toEqual({ id: "site", name: "example.org", family: "site" })
  })

  it("gives each link the family the server gives it, so a chip and the tree mark it alike", () => {
    expect(families.length).toBeGreaterThan(0)
    expect(families.map((c) => `${c.url} ${linkProvider(c.url).family}`)).toEqual(families.map((c) => `${c.url} ${c.family}`))
  })

  // The backend holds the copy LinkFamily is held to. Pointed at a backend
  // checkout (ONECAMP_BACKEND_DIR, as when gating a release), the two copies
  // must be byte-equal, so a family added on one side alone turns the gate red.
  const backendDir = process.env.ONECAMP_BACKEND_DIR
  const backend = backendDir && path.join(backendDir, "testdata", "linkfamily", "links.json")
  it.skipIf(!backend)("holds its fixture to the backend's, byte for byte", () => {
    expect(existsSync(backend as string), `${backend} exists`).toBe(true)
    expect(readFileSync(FAMILIES, "utf8")).toBe(readFileSync(backend as string, "utf8"))
  })
})
