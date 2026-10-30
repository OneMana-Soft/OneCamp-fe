import { createHash } from "node:crypto"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { brotliDecompressSync } from "node:zlib"
import { describe, expect, it } from "vitest"

// Inter is served from public/fonts/inter (app/inter.css). The build used to
// fetch it from Google through next/font/google, and a Google Fonts outage
// failed a build on 22 Oct; a customer's own build behind a firewall can't
// reach Google at all. /fonts is cached for good, so a file must never change
// under its name, and the type scale's optical sizes need the opsz axis in
// the files themselves.

const root = resolve(__dirname, "..")
const read = (path: string) => readFileSync(resolve(root, path), "utf8")
const css = read("app/inter.css")
const faces = [...css.matchAll(/\/\* ([\w-]+) \*\/\s*@font-face \{[^}]*url\("(\/fonts\/inter\/[^"]+)"\)/g)].map(([, subset, url]) => ({ subset, url }))
const file = (url: string) => readFileSync(resolve(root, "public", url.slice(1)))

/** The three of WOFF2's known table tags (§5.1) the reader needs; the rest stay nameless. */
const KNOWN_TAGS: Record<number, string> = { 10: "glyf", 11: "loca", 47: "fvar" }

/** The variation axes in a WOFF2 file's fvar table: ["opsz 14-32", "wght 100-900"]. */
function axesOf(font: Buffer): string[] {
  const tables: { tag: string; length: number }[] = []
  let at = 48
  const base128 = () => {
    let value = 0
    for (;;) {
      const byte = font[at++]
      value = value * 128 + (byte & 0x7f)
      if (!(byte & 0x80)) return value
    }
  }
  for (let i = 0; i < font.readUInt16BE(12); i++) {
    const flags = font[at++]
    const tag = (flags & 63) === 63 ? font.toString("latin1", at, (at += 4)) : (KNOWN_TAGS[flags & 63] ?? "")
    const length = base128()
    const transformed = (flags >> 6) & 3 ? !["glyf", "loca"].includes(tag) : ["glyf", "loca"].includes(tag)
    tables.push({ tag, length: transformed ? base128() : length })
  }
  const data = brotliDecompressSync(font.subarray(at, at + font.readUInt32BE(20)))
  let offset = 0
  for (const t of tables) {
    if (t.tag === "fvar") {
      const fvar = data.subarray(offset, offset + t.length)
      const first = fvar.readUInt16BE(4)
      const size = fvar.readUInt16BE(10)
      return Array.from({ length: fvar.readUInt16BE(8) }, (_, i) => {
        const a = first + i * size
        return `${fvar.toString("latin1", a, a + 4)} ${fvar.readInt32BE(a + 4) / 65536}-${fvar.readInt32BE(a + 12) / 65536}`
      })
    }
    offset += t.length
  }
  return []
}

describe("Inter, served from the app itself", () => {
  it("never comes from next/font/google", () => {
    const sources = ["app", "components", "lib"].flatMap((dir) =>
      readdirSync(resolve(root, dir), { recursive: true, encoding: "utf8" })
        .filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."))
        .map((f) => join(dir, f)),
    )
    expect(sources.filter((f) => read(f).includes("next/font/google"))).toEqual([])
  })

  it("has a face per script, each file named by its own hash", () => {
    expect(faces.map((f) => f.subset)).toEqual(["cyrillic-ext", "cyrillic", "greek-ext", "greek", "vietnamese", "latin-ext", "latin"])
    for (const { subset, url } of faces) {
      const hash = createHash("sha256").update(file(url)).digest("hex").slice(0, 8)
      expect(url).toBe(`/fonts/inter/inter-${subset}.${hash}.woff2`)
    }
  })

  it("preloads latin, the one every page draws", () => {
    const latin = faces.find((f) => f.subset === "latin")?.url
    expect(read("app/layout.tsx")).toContain(`const INTER_LATIN = "${latin}"`)
  })

  it("keeps the optical sizes and every weight in each file", () => {
    for (const { url } of faces) expect(axesOf(file(url))).toEqual(["opsz 14-32", "wght 100-900"])
  })

  it("ships Inter's licence beside the files", () => {
    expect(existsSync(resolve(root, "public/fonts/inter/OFL.txt"))).toBe(true)
    expect(read("public/fonts/inter/OFL.txt")).toContain("SIL OPEN FONT LICENSE Version 1.1")
  })
})
