import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

import ts from "typescript"
import { describe, expect, it } from "vitest"

/**
 * British (Indian) English in everything people read (owner, 12 Oct 2026):
 * summarise, colour, cancelled, organise, favourite, as on onemana.dev and the
 * blog. The sweep changed only strings people read; identifiers, API fields,
 * CSS classes, test ids, analytics keys and the tool names a model calls keep
 * their spelling ("summarize_channel", a "canceled" status, "items-center").
 *
 * This holds the copy to it: JSX text, toasts' titles and descriptions, and
 * the attributes and fields a screen shows or a screen reader says (aria-label,
 * title, placeholder, alt, label, description, ...).
 */

const ROOT = process.cwd()
const DIRS = ["app", "components", "hooks", "lib", "services", "store", "context"]

/** The US spellings, as whole words, case aside. */
const US = new RegExp(
  "\\b(" +
    [
      "summariz(?:e|es|ed|ing|ation)",
      "colou?r(?<!colour)s?", // color, colors
      "colored", "coloring", "colorful",
      "cancel(?:ed|ing|ation)",
      "organiz(?:e|es|ed|ing|ation|ations|er)",
      "favorite(?:s|d)?",
      "behaviors?",
      "analyz(?:e|es|ed|ing|er)",
      "authoriz(?:e|es|ed|ing|ation)",
      "customiz(?:e|es|ed|ing|ation)",
      "prioritiz(?:e|es|ed|ing)",
      "recogniz(?:e|es|ed|ing)",
      "realiz(?:e|es|ed|ing)",
      "synchroniz(?:e|es|ed|ing)",
      "emphasiz(?:e|es|ed|ing)",
      "optimiz(?:e|es|ed|ing|ation)",
      "personaliz(?:e|es|ed|ing|ation)",
      "finaliz(?:e|es|ed|ing)",
      "categoriz(?:e|es|ed|ing)",
      "visualiz(?:e|es|ed|ing|ation)",
      "label(?:ed|ing)",
      "catalogs?",
      "gray",
      "centered", "center",
      "enroll(?:s|ment)?",
      "fulfill(?:s|ment)?",
      "honors?", "neighbors?", "humor", "flavors?",
      "defense",
    ].join("|") +
    ")\\b",
  "i",
)

/** Where a string is something a screen shows or a screen reader says. */
const SHOWN_ATTRS = new Set(["aria-label", "aria-description", "title", "placeholder", "alt", "label", "description", "tooltip", "subject", "what", "text", "hint", "heading", "detail", "caption", "confirmLabel"])
const SHOWN_FIELDS = new Set(["title", "description", "label", "placeholder", "message", "hint", "subtitle", "heading", "detail", "success", "error", "spoken"])

/** A list of class names ("flex justify-center items-center"), which a screen never shows. */
const classList = (t: string) => {
  const words = t.trim().split(/\s+/)
  return words.every((w) => /^[a-z0-9:[\]\-/().%_!@&>*#=,]+$/.test(w)) && words.some((w) => w.includes("-"))
}

// Words that name something else, kept as that thing spells it.
const KEPT = [
  /\bAuthorization:? ?(\(Bearer\)|Bearer)/, // the HTTP header
  /oauth\/authorize/i, // an address
  /open Customize, then Connectors/, // Claude's own menu, as it is labelled
  /choose Authorize OAuth/, // the client's own button
]

// Files that still say a US spelling, each with its owner. Empty it.
const PENDING = new Map<string, string>([])

function sourceFiles(dir: string, out: string[] = []): string[] {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name !== "node_modules") sourceFiles(p, out)
    } else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name) && !e.name.endsWith(".d.ts")) out.push(p)
  }
  return out
}

const nameOf = (n: ts.Node, sf: ts.SourceFile) => (n as { name?: ts.Node }).name?.getText(sf).replace(/["']/g, "") ?? ""

/** Copy in one file that spells a word the US way, as "file: word in its text". */
export function usSpellings(file: string, src: string): string[] {
  if (!US.test(src)) return []
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const found: string[] = []
  const shown = (n: ts.Node): boolean => {
    if (ts.isJsxText(n)) return true
    let p = n.parent
    if (p && ts.isJsxExpression(p)) p = p.parent
    if (p && ts.isConditionalExpression(p)) p = ts.isJsxExpression(p.parent) ? p.parent.parent : p.parent
    if (p && ts.isJsxAttribute(p)) return SHOWN_ATTRS.has(p.name.getText(sf))
    if (p && ts.isPropertyAssignment(p) && SHOWN_FIELDS.has(nameOf(p, sf))) return true
    // toast({ title, description }) and a toast's own words
    for (let up: ts.Node | undefined = n.parent; up; up = up.parent) {
      if (ts.isCallExpression(up)) return /\btoast$/.test(up.expression.getText(sf)) && !!p && ts.isPropertyAssignment(p)
      if (ts.isBlock(up) || ts.isSourceFile(up)) break
    }
    return false
  }
  const visit = (n: ts.Node) => {
    let text: string | null = null
    if (ts.isJsxText(n)) text = n.text
    else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) text = n.text
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) text = n.text
    if (text && US.test(text) && !classList(text) && !KEPT.some((k) => k.test(text!)) && shown(n)) {
      found.push(`${relative(ROOT, file)}: ${text.match(US)![0]} in "${text.trim().replace(/\s+/g, " ").slice(0, 70)}"`)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return found
}

describe("British spelling in the copy", () => {
  const files = DIRS.flatMap((d) => sourceFiles(join(ROOT, d)))

  it("scans the whole app", () => {
    expect(files.length).toBeGreaterThan(500)
  })

  it("spells the words people read the British way", () => {
    const found = files.filter((f) => !PENDING.has(relative(ROOT, f))).flatMap((f) => usSpellings(f, readFileSync(f, "utf8")))
    expect(found).toEqual([])
  })

  it("keeps its pending list honest: each file listed still has a US spelling", () => {
    for (const f of PENDING.keys()) expect(usSpellings(join(ROOT, f), readFileSync(join(ROOT, f), "utf8")).length, f).toBeGreaterThan(0)
  })

  it("reads the copy, not the code: identifiers, classes and tool names keep their spelling", () => {
    const src = [
      'const a = <p>Summarize this thread</p>',
      'const b = <button aria-label="Add to favorites" className="items-center" />',
      'toast({ title: "Model authorized", description: "Canceled." })',
      'const c = { name: "summarize_channel", label: "Summarize a channel" }',
      'if (status === "canceled") track("color_picked")',
      'const d = <span className="text-center">{x}</span>',
      'const e = { label: "Authorization (Bearer)" }',
    ].join("\n")
    expect(usSpellings(join(ROOT, "x.tsx"), src).map((s) => s.split(": ")[1].split(" in ")[0])).toEqual([
      "Summarize",
      "favorites",
      "authorized",
      "Canceled",
      "Summarize",
    ])
  })
})
