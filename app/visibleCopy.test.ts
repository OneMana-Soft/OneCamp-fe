import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { EN_MESSAGES, copyFiles, copyTexts, lineOf, messageTexts } from "@/lib/testing/copyStrings"

/**
 * No dashes used as punctuation in anything a person reads.
 *
 * WHY. The house style joins clauses with a colon, a comma or parentheses,
 * never an em dash or a spaced double hyphen. A sweep fixed every instance
 * once, and a few crept back in the places a sweep reads least well: text that
 * begins after a JSX expression, a select's placeholder option, a log line.
 * This keeps it fixed.
 *
 * WHAT COUNTS. Every string literal, template piece and JSX text in the app's
 * source, and every value in the English messages. Comments are not read, so
 * they may say what they like. A dash standing alone ("—" in an empty table
 * cell) is a sign for "nothing here", not punctuation, and is allowed.
 */

const ROOT = process.cwd()
const DASH = /\u2014|\s--\s/

/** Dashed copy in one file's strings and JSX text, as "file:line: text". */
export function dashedCopy(file: string, src: string): string[] {
  if (!DASH.test(src)) return []
  return copyTexts(file, src)
    .filter(({ text }) => text.trim() !== "\u2014" && DASH.test(text))
    .map((t) => `${lineOf(t)}: ${t.text.trim().slice(0, 100)}`)
}

const dashedMessages = (value: unknown): string[] =>
  messageTexts(value).flatMap(({ path, text }) => (DASH.test(text) ? [`${path}: ${text.slice(0, 100)}`] : []))

describe("visible copy", () => {
  it("uses no em dash or spaced double hyphen as punctuation", () => {
    const found = copyFiles().flatMap((f) => dashedCopy(f, readFileSync(f, "utf8")))
    expect(found).toEqual([])
  })

  it("keeps the English messages free of them too", () => {
    const en = JSON.parse(readFileSync(join(ROOT, EN_MESSAGES), "utf8"))
    expect(dashedMessages(en)).toEqual([])
  })

  it("reads strings and JSX text, not comments, and allows a lone dash for an empty value", () => {
    const src = [
      "// a comment — is not copy",
      'const a = "fine: this is copy"',
      'const empty = <td>—</td>',
      'const bad = <p>{n} — slower</p>',
      "const t = `x ${y} — z`",
      'const flag = "run it -- now"',
    ].join("\n")
    expect(dashedCopy(join(ROOT, "x.tsx"), src).map((s) => s.split(": ")[0])).toEqual(["x.tsx:4", "x.tsx:5", "x.tsx:6"])
  })
})
