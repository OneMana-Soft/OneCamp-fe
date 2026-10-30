// Reads a woff2 font's own name table: who holds its copyright and what
// licence it is under, as the font file itself says (OpenType name IDs
// 0 copyright, 5 version, 13 licence, 14 licence URL). The board's notices
// (scripts/board-notices.mjs) are written from these, so they can't drift
// from the faces this server serves.
import { readFileSync } from "node:fs"
import { brotliDecompressSync } from "node:zlib"

// WOFF2's known-table tags, by their index in the table directory's flags (WOFF2 spec, 5.1).
const KNOWN = ["cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar", "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar", "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill"]

export const NAME_IDS = { copyright: 0, version: 5, licence: 13, licenceUrl: 14 }

/** { copyright, version, licence, licenceUrl } from a woff2 file's name table; a missing record is undefined. */
export function fontNames(path) {
  const b = readFileSync(path)
  if (b.toString("latin1", 0, 4) !== "wOF2") throw new Error(`${path} is not a woff2 font`)
  let p = 48
  const base128 = () => {
    let v = 0
    for (let i = 0; i < 5; i++) {
      const x = b[p++]
      v = v * 128 + (x & 127)
      if (!(x & 128)) break
    }
    return v
  }
  const tables = []
  for (let i = 0, n = b.readUInt16BE(12); i < n; i++) {
    const flags = b[p++]
    let tag
    if ((flags & 63) === 63) {
      tag = b.toString("latin1", p, p + 4)
      p += 4
    } else tag = KNOWN[flags & 63]
    const transform = (flags >> 6) & 3
    let length = base128()
    // glyf and loca are transformed unless their version is 3; every other table only when its version isn't 0.
    if (tag === "glyf" || tag === "loca" ? transform !== 3 : transform !== 0) length = base128()
    tables.push({ tag, length })
  }
  const data = brotliDecompressSync(b.subarray(p))
  let off = 0
  let name
  for (const t of tables) {
    if (t.tag === "name") name = data.subarray(off, off + t.length)
    off += t.length
  }
  if (!name) throw new Error(`${path} has no name table`)
  const count = name.readUInt16BE(2)
  const strings = name.readUInt16BE(4)
  const found = {}
  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12
    const platform = name.readUInt16BE(r)
    const lang = name.readUInt16BE(r + 4)
    const id = name.readUInt16BE(r + 6)
    const s = name.subarray(strings + name.readUInt16BE(r + 10), strings + name.readUInt16BE(r + 10) + name.readUInt16BE(r + 8))
    const text = platform === 1 ? s.toString("latin1") : Buffer.from(s).swap16().toString("utf16le")
    // Windows English (3, 0x409) is the record a font's tools write first-hand; else the first one there is.
    const rank = platform === 3 && lang === 0x409 ? 0 : 1
    if (!found[id] || rank < found[id].rank) found[id] = { rank, text }
  }
  const pick = (id) => found[id]?.text
  return { copyright: pick(0), version: pick(5)?.trim(), licence: pick(13), licenceUrl: pick(14) }
}
