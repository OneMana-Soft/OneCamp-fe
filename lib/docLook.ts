// A doc's icon and cover as stored (B6, D-2): an emoji or "glyph:<name>[:<hue>]";
// "gallery:<name>" or "<doc>/<file>". Pure; on the doc route's first load.

export type DocIconOf = { emoji: string } | { glyph: string; hue?: string } | null

export function docIconOf(icon?: string | null): DocIconOf {
  const s = (icon ?? "").trim()
  if (!s) return null
  if (s.startsWith("glyph:")) {
    const [, glyph, hue] = s.split(":")
    return glyph ? { glyph, hue } : null
  }
  return s.includes(":") ? null : { emoji: s }
}

export type DocCoverOf = { gallery: string } | { doc: string; file: string } | null

export function docCoverOf(cover?: string | null): DocCoverOf {
  const s = cover ?? ""
  if (s.startsWith("gallery:")) return { gallery: s.slice(8) }
  const [doc, file] = s.split("/")
  return doc && file ? { doc, file } : null
}
