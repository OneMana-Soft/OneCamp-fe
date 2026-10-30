import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import vendored from "./vendored.json"
import { fontNames } from "../../scripts/fontNames.mjs"
import { filesUnder } from "../../scripts/vendor-assets.mjs"
import { NOTICES, noticesText } from "../../scripts/board-notices.mjs"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"

// This server hands out Excalidraw's faces (self-hosted installs, the public
// repo), so each one's notice says what its own file says: who holds it and
// under what licence. A package bump that brings a face with other terms
// fails here, not after it has shipped.

const root = join(__dirname, "..", "..")
const excalidraw = vendored.packages.find((p) => p.pkg === "@excalidraw/excalidraw")!
const [from] = excalidraw.trees[0]
const fonts = join(root, "node_modules/@excalidraw/excalidraw", from)
const notices = readFileSync(join(root, "public/board/THIRD-PARTY-NOTICES.txt"), "utf8")
// The notice is read as text: line breaks and runs of spaces don't change what it says.
const flat = (s: string) => s.replace(/\s+/g, " ").trim()

/** Each face's distinct name records, over every file of it (Xiaolai's 209 subsets included). */
const faces = new Map<string, Set<string>>()
for (const f of filesUnder(fonts) as string[]) {
  const face = f.split("/")[0]
  const n = fontNames(join(fonts, f))
  if (!faces.has(face)) faces.set(face, new Set())
  faces.get(face)!.add(JSON.stringify(n))
}

describe("every face's notice", () => {
  it("is there for each face this server serves", () => {
    expect([...faces.keys()].sort()).toEqual(["Assistant", "Cascadia", "ComicShanns", "Excalifont", "Liberation", "Lilita", "Nunito", "Virgil", "Xiaolai"])
  })

  for (const [face, records] of faces) {
    it(`${face}: carries its file's own copyright, version and licence, word for word`, () => {
      for (const r of records) {
        const n = JSON.parse(r) as { copyright?: string; version?: string; licence?: string; licenceUrl?: string }
        expect(n.copyright, `${face} has a copyright record`).toBeTruthy()
        expect(flat(notices), `${face}: its copyright (name ID 0)`).toContain(flat(n.copyright!))
        if (n.version) expect(flat(notices), `${face}: its version (name ID 5)`).toContain(flat(n.version))
        if (n.licence) expect(flat(notices), `${face}: its licence (name ID 13)`).toContain(flat(n.licence))
        if (n.licenceUrl) expect(notices, `${face}: its licence URL (name ID 14)`).toContain(n.licenceUrl)
      }
    })
  }

  it("is the one board-notices.mjs writes from the files, so it can't drift (node scripts/board-notices.mjs)", () => {
    expect(notices).toBe(noticesText())
    expect(NOTICES).toBe("public/board/THIRD-PARTY-NOTICES.txt")
  })

  it("ships each face's licence text beside it, and names a source for any licence its file doesn't state", () => {
    const meta = excalidraw.faces as Record<string, { licence: string; texts: string[]; statedBy?: string; sha256?: Record<string, string> }>
    expect(Object.keys(meta).sort()).toEqual([...faces.keys()].sort())
    for (const [face, records] of faces) {
      for (const t of meta[face].texts) expect(existsSync(join(root, "public/board", t)), `${face}: ${t}`).toBe(true)
      const saysLicence = [...records].some((r) => {
        const n = JSON.parse(r) as { copyright?: string; licence?: string; licenceUrl?: string }
        return !!(n.licence || n.licenceUrl || /licen[cs]e/i.test(n.copyright ?? ""))
      })
      if (!saysLicence) expect(meta[face].statedBy, `${face}'s file names no licence: say who states it`).toBeTruthy()
    }
  })

  it("Cascadia is Microsoft's OFL release from GitHub, byte for byte", () => {
    const meta = excalidraw.faces.Cascadia as { sha256: Record<string, string>; from: string }
    expect(meta.from).toContain("microsoft/cascadia-code v2005.15")
    for (const [file, sha256] of Object.entries(meta.sha256)) {
      expect(createHash("sha256").update(readFileSync(join(fonts, "Cascadia", file))).digest("hex"), file).toBe(sha256)
    }
  })
})
