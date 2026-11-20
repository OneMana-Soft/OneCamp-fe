import { readFileSync } from "node:fs"
import { join, relative } from "node:path"

import { describe, expect, it } from "vitest"

import { SHORTCUT_GROUPS } from "@/components/docEditor/shortcuts"
import { copyFiles, copyTexts, messageTexts } from "@/lib/testing/copyStrings"

/**
 * The copy rules (docs PROGRAM I22, G-COPY), in everything a person reads:
 * no version numbers, and never "compliant", "compliance" or "certified"
 * (say "recorded", "you can check it"). Every string literal, template piece
 * and JSX text in the app's source, and the English messages; comments may
 * say what they like. And the doc's own labels are in sentence case.
 */

const ROOT = process.cwd()
const VERSION = /\bv\d+(?:\.\d+)+\b|\b\d+\.\d+\.\d+\b|\bversion\s+\d/i
const CLAIM = /complian|certified/i
/** SVG path data reads like version numbers ("M12 5.38c1.62…"). */
const PATH_DATA = /^[Mm][\d\s.,+-]/
/** A WebGL shader's source opens with its GLSL version ("#version 300 es"); no one reads it. */
const SHADER = /^#version \d+ es\n/
/** Not shown to anyone: words people search the admin by (lib/adminSections keywords). */
const ALLOWED = new Set(["lib/adminSections.ts: compliance"])

/** Copy in one file that breaks the rules, as "file: text". */
export function brokenCopy(file: string, src: string): string[] {
  if (!VERSION.test(src) && !CLAIM.test(src)) return []
  const found: string[] = []
  for (const { text } of copyTexts(file, src)) {
    if (text && !PATH_DATA.test(text.trim()) && !SHADER.test(text.trim()) && (VERSION.test(text) || CLAIM.test(text))) {
      const entry = `${relative(ROOT, file)}: ${text.trim().slice(0, 80)}`
      if (!ALLOWED.has(entry)) found.push(entry)
    }
  }
  return found
}

const brokenMessages = (value: unknown): string[] =>
  messageTexts(value).flatMap(({ path, text }) => (VERSION.test(text) || CLAIM.test(text) ? [`${path}: ${text.slice(0, 80)}`] : []))

describe("copy rules", () => {
  it("has no version numbers and claims no compliance, in any copy", () => {
    const found = copyFiles().flatMap((f) => brokenCopy(f, readFileSync(f, "utf8")))
    expect(found).toEqual([])
  })

  it("keeps the English messages to the same rules", () => {
    // A literal path, so scripts/relatedTests runs this test when en.json changes.
    const en = JSON.parse(readFileSync(join(ROOT, "lib/utils/i18n/locales/en/en.json"), "utf8"))
    expect(brokenMessages(en)).toEqual([])
  })

  it("reads strings, not comments, and skips drawing paths and shaders", () => {
    const src = ['// compliant in a comment', 'const a = "Now compliant"', 'const b = <p>New in v2.3</p>', 'const d = "M12 5.38c1.62 0 3.06.56"', 'const e = `#version 300 es\nvoid main() {}`', 'const f = "#version 3 is here"'].join("\n")
    expect(brokenCopy(join(ROOT, "x.tsx"), src)).toEqual(["x.tsx: Now compliant", "x.tsx: New in v2.3", "x.tsx: #version 3 is here"])
  })

  it("writes the doc's shortcut labels in sentence case", () => {
    const proper = new Set(["AI", "OneCamp", "Markdown"])
    for (const row of SHORTCUT_GROUPS.flatMap((g) => g.rows)) {
      const [first, ...rest] = row.label.split(" ")
      expect(first[0], row.label).toBe(first[0].toUpperCase())
      for (const w of rest) if (!proper.has(w)) expect(w, row.label).toBe(w.toLowerCase())
    }
  })
})
