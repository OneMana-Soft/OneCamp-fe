import { readFileSync } from "node:fs"
import postcss, { type AtRule, type Container, type Node, type Rule } from "postcss"
import { describe, expect, it } from "vitest"

import { sourceFiles } from "@/lib/testing/sourceFiles"

/**
 * NO ROOT :has() (app/globals.css, AppShellMark; V-111, 30 Oct).
 *
 * A selector that starts at the page's root and asks :has() of it
 * (html:has(...), :root:has(...), html:is(..., :has(...))) is matched again
 * on every change anywhere in the document. State the whole page reads is ONE
 * mark on <html>, set by the shared piece that owns it: the app shell's
 * (AppShellMark), a float's (components/ui/floatMark), a sheet's
 * (components/ui/sheetMark), counted where two can be up at once.
 *
 * It fails on any rule whose selector, nesting resolved, has a first compound
 * that starts with html or :root and holds a :has(). Print styles apply only
 * while printing, so @media print is passed over.
 */

/** A selector's first compound: everything before its first combinator outside brackets, parentheses and quotes. */
function firstCompound(selector: string): string {
  let depth = 0
  let quote = ""
  const s = selector.trim()
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quote) {
      if (c === "\\") i++
      else if (c === quote) quote = ""
    } else if (c === '"' || c === "'") quote = c
    else if (c === "(" || c === "[") depth++
    else if (c === ")" || c === "]") depth--
    else if (depth === 0 && /[\s>+~]/.test(c)) return s.slice(0, i)
  }
  return s
}

/** Whether a selector asks :has() of the page's root. */
function asksRootHas(selector: string): boolean {
  const first = firstCompound(selector)
  return /^(html|:root)(?![\w-])/.test(first) && first.includes(":has(")
}

/** A rule's selectors with the rules it is nested in written out (& is its parent's selector). */
function resolved(rule: Rule): string[] {
  const parent = rule.parent as Container | undefined
  if (parent?.type !== "rule") return rule.selectors
  return resolved(parent as Rule).flatMap((p) => rule.selectors.map((s) => (s.includes("&") ? s.replaceAll("&", p) : `${p} ${s}`)))
}

const printed = (rule: Rule) => {
  for (let n: Node | undefined = rule.parent; n; n = n.parent) {
    if (n.type !== "atrule") continue
    const at = n as AtRule
    if (at.name === "media" && /^\s*print\b/.test(at.params)) return true
  }
  return false
}

describe("no CSS asks :has() of the page's root", () => {
  it("knows a root :has() wherever it sits in the first compound, and nothing past it", () => {
    expect(asksRootHas('html:has([data-v3-sheet][data-state="open"]) .toast-viewport')).toBe(true)
    expect(asksRootHas('html:is([data-keyboard="open"], :has(.x)) .toast-root')).toBe(true)
    expect(asksRootHas(":root:has(.doc-scroll)")).toBe(true)
    expect(asksRootHas('html[data-sheet="open"] .toast-viewport')).toBe(false)
    expect(asksRootHas('html[data-keyboard="open"] [data-detent="half"]:has(input:focus)')).toBe(false)
    expect(asksRootHas(".html-preview:has(img)")).toBe(false)
    expect(asksRootHas('html[data-label="a b"]:has(.x)')).toBe(true)
  })

  it("holds in every stylesheet", () => {
    const found: string[] = []
    for (const file of sourceFiles(["app", "components"], /\.css$/)) {
      postcss.parse(readFileSync(file, "utf8"), { from: file }).walkRules((rule) => {
        if (printed(rule)) return
        for (const s of resolved(rule)) if (asksRootHas(s)) found.push(`${file}:${rule.source?.start?.line}: ${s}`)
      })
    }
    expect(found, "page-wide state is one mark on <html>, set by its shared piece").toEqual([])
  })
})
