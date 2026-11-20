import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { sourceFiles, testFiles } from "@/lib/testing/sourceFiles"

/**
 * NO SELECTOR MAKES CHROME RESTYLE A WHOLE SUBTREE ON EVERY DOM CHANGE (V-924, 13 Nov 2026).
 *
 * Chrome finds what a DOM change restyles through invalidation sets it builds
 * from the page's selectors. Two shapes turn a set into "everything under here":
 *
 * 1. A sibling combinator (+ or ~) with no class, id or attribute on its left
 *    and a universal right: `X > * + *`, `* + *::before`, `:is(h1, h2) + *`.
 *    With nothing on the left to key it by, Chrome files the selector in its
 *    one universal sibling set, which it schedules on EVERY insertion and
 *    removal anywhere in the document; with nothing on the right, that set
 *    invalidates the next sibling's whole subtree. A sheet's portal and
 *    Radix's focus guards come and go as children of <body>, so opening and
 *    closing any overlay restyled the whole page (the tables record sheet at
 *    390: 975 elements on open, 999 + 750 on close). `X > :where(:not(:first-child))`
 *    matches what `X > * + *` matched, at the same specificity, with no sibling
 *    combinator. A keyed left (`[data-large-title] + * > .sticky`) or a right
 *    with a type (`p + p`, `* + .set-row`) stays narrow and passes.
 *    Chrome reads each argument of an :is() or :where() on the left as a
 *    compound of its own, so ONE argument with no class, id or attribute
 *    makes the selector universal whatever else the left has:
 *    `.heading-node:is(h1, h2) + *` and `:is(h1, h2):where(.heading-node) + *`
 *    restyled the whole page as `:is(h1, h2) + *` did, while
 *    `.heading-node + *` and `:where(.heading-node) + *` did not (V-924F2's
 *    trace, 14 Nov: the key may sit inside :where(), but no argument may lack one).
 * 2. A :has() that isn't the subject, followed by a universal subject:
 *    `.g:has(.x) *`, and Tailwind's group-has-[..] / peer-has-[..] variants,
 *    which compile to `.c:is(:where(.group):has(..) *)`. Chrome merges every
 *    non-subject :has() into one set, so a mutation under ANY :has() anchor
 *    (the overlay's own) restyled a whole subtree (the sheet, five times per
 *    open). A targeted rule names its subject, as an arbitrary variant does:
 *    `[:where([data-stage-tile]):has([data-ink-drawing])_&]:hidden`.
 *
 * A Tailwind arbitrary variant is a selector too (`[&>*+*]` before a utility
 * compiles to `.c>*+*`), so the class scan reads each one as the selector it
 * becomes and checks it for both shapes. Tailwind compiles every class it
 * finds in ANY file, tests included, so the scan reads tests too, and this
 * file's own fixtures write a variant's colon as `^` (a whole `[&>*+*]` plus
 * colon plus utility here shipped `.c>*+*` in the root stylesheet).
 */

type Part = { comb: string; compound: string }
type Features = { keyed: boolean; typed: boolean; has: boolean; unkeyedArg: boolean; args: string[] }

/** The index of the quote that closes the one at i. */
function closeQuote(s: string, i: number): number {
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === "\\") j++
    else if (s[j] === s[i]) return j
  }
  return s.length - 1
}

/** Splits at commas outside (), [] and strings. */
function splitList(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let from = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === "\\") i++
    else if (c === '"' || c === "'") i = closeQuote(s, i)
    else if (c === "(" || c === "[") depth++
    else if (c === ")" || c === "]") depth--
    else if (c === "," && depth === 0) {
      out.push(s.slice(from, i).trim())
      from = i + 1
    }
  }
  out.push(s.slice(from).trim())
  return out.filter(Boolean)
}

/** A complex selector's compounds, each with the combinator before it ("" first, " " descendant). */
function parts(sel: string): Part[] {
  const out: Part[] = []
  let cur = ""
  let comb = ""
  let depth = 0
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i]
    if (c === "\\") {
      cur += c + (sel[i + 1] ?? "")
      i++
      continue
    }
    if (c === '"' || c === "'") {
      const j = closeQuote(sel, i)
      cur += sel.slice(i, j + 1)
      i = j
      continue
    }
    if (c === "(" || c === "[") depth++
    else if (c === ")" || c === "]") depth--
    if (depth === 0 && /[\s>+~]/.test(c)) {
      if (cur) out.push({ comb, compound: cur })
      if (cur) comb = " "
      cur = ""
      if (!/\s/.test(c)) comb = c
      continue
    }
    cur += c
  }
  if (cur) out.push({ comb, compound: cur })
  return out
}

/** The argument of the functional pseudo-class that opens at s[i] ("("), and the index of its ")". */
function argAt(s: string, i: number): [string, number] {
  let depth = 0
  for (let j = i; j < s.length; j++) {
    if (s[j] === "\\") j++
    else if (s[j] === '"' || s[j] === "'") j = closeQuote(s, j)
    else if (s[j] === "(") depth++
    else if (s[j] === ")" && --depth === 0) return [s.slice(i + 1, j), j]
  }
  return [s.slice(i + 1), s.length]
}

const IDENT = /^(?:\\.|[\w-]|[\u0080-\uffff])+/

/**
 * What Chrome can key a compound by: keyed = a class, id or attribute (what a
 * sibling set is keyed on); typed = that or an element type (what narrows an
 * invalidation); has = a :has() in it; unkeyedArg = an :is() or :where()
 * argument (at any depth) with no class, id or attribute, which Chrome files
 * as a universal sibling whatever the rest of the compound has; args = the
 * selector lists of its functional pseudo-classes, checked in their own
 * right. :is() and :where() count when every argument does; :not() never narrows.
 */
function features(compound: string): Features {
  const f: Features = { keyed: false, typed: false, has: false, unkeyedArg: false, args: [] }
  for (let i = 0; i < compound.length; ) {
    const c = compound[i]
    const rest = compound.slice(i)
    if (c === "*" || c === "&" || c === "|") i++
    else if (c === "." || c === "#") {
      f.keyed = f.typed = true
      i += 1 + (rest.slice(1).match(IDENT)?.[0].length ?? 0)
    } else if (c === "[") {
      f.keyed = f.typed = true
      let j = i
      while (j < compound.length && compound[j] !== "]") j = compound[j] === "\\" ? j + 2 : compound[j] === '"' || compound[j] === "'" ? closeQuote(compound, j) + 1 : j + 1
      i = j + 1
    } else if (c === ":") {
      const element = rest.startsWith("::")
      const name = (rest.slice(element ? 2 : 1).match(IDENT)?.[0] ?? "").toLowerCase()
      i += (element ? 2 : 1) + name.length
      if (compound[i] !== "(") continue
      const [arg, end] = argAt(compound, i)
      i = end + 1
      if (element) continue
      if (name === "has") f.has = true
      // nth-child(An+B of S): S is a selector list.
      const list = /^(nth-child|nth-last-child)$/.test(name) ? (arg.match(/\bof\s+([\s\S]*)$/)?.[1] ?? "") : /^(is|where|matches|-webkit-any|not|has|global|local)$/.test(name) ? arg : ""
      if (list) f.args.push(list)
      if (/^(is|where|matches|-webkit-any|global|local)$/.test(name)) {
        const subjects = splitList(arg).map((a) => features(parts(a).at(-1)?.compound ?? ""))
        if (subjects.length && subjects.every((s) => s.keyed)) f.keyed = true
        if (subjects.length && subjects.every((s) => s.typed)) f.typed = true
        if (subjects.some((s) => !s.keyed || s.unkeyedArg)) f.unkeyedArg = true
      }
    } else {
      const m = rest.match(IDENT)
      if (m) {
        f.typed = true
        i += m[0].length
      } else i++
    }
  }
  return f
}

/** Why a selector list makes Chrome invalidate a whole subtree, one line per shape; empty when it doesn't. */
function wholeSubtreeShapes(list: string): string[] {
  const out: string[] = []
  for (const sel of splitList(list)) {
    const ps = parts(sel)
    const fs = ps.map((p) => features(p.compound))
    for (let k = 1; k < ps.length; k++) {
      if ((ps[k].comb === "+" || ps[k].comb === "~") && !fs[k].typed) {
        const pair = `"${ps[k - 1].compound} ${ps[k].comb} ${ps[k].compound}"`
        if (!fs[k - 1].keyed) out.push(`universal sibling ${pair} in ${sel}`)
        else if (fs[k - 1].unkeyedArg) out.push(`universal sibling ${pair} (an :is()/:where() argument with no class, id or attribute) in ${sel}`)
      }
    }
    if (ps.length > 1 && !fs[ps.length - 1].typed && fs.slice(0, -1).some((f) => f.has)) out.push(`a universal subject after a non-subject :has() in ${sel}`)
    for (const f of fs) for (const arg of f.args) out.push(...wholeSubtreeShapes(arg))
  }
  return out
}

/**
 * Each rule's selector list in a stylesheet, with the line it starts on. At-rule preludes are passed over, and so is
 * everything under @media print: Chrome builds a screen's invalidation sets only from the rules whose media match.
 */
function selectorLists(css: string): { line: number; list: string }[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  const out: { line: number; list: string }[] = []
  const print: boolean[] = []
  let line = 1
  let from = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === "\n") line++
    else if (c === "\\") i++
    else if (c === '"' || c === "'") i = closeQuote(text, i)
    else if (c === "}" || c === ";") {
      if (c === "}") print.pop()
      from = i + 1
    } else if (c === "{") {
      const pre = text.slice(from, i)
      const at = pre.search(/\S/)
      const inPrint = print.includes(true)
      if (at >= 0 && pre[at] !== "@" && !inPrint) out.push({ line: line - (pre.slice(at).match(/\n/g)?.length ?? 0), list: pre.trim() })
      print.push(inPrint || /^@media\s+print\s*$/i.test(pre.trim()))
      from = i + 1
    }
  }
  return out
}

/** A Tailwind group-has-* or peer-has-* variant before its utility: `.c:is(:where(.group):has(..) *)`. */
const HAS_VARIANT = /(?<![\w-])(?:group|peer)-has-(?:\[\S*?\]|[a-z][\w-]*)(?:\/[\w-]+)?:[\w![-]/

/**
 * The selector each Tailwind arbitrary variant on a line compiles to (`[&>*+*]` + `:mt-2` -> `.x>*+*`): `&` is the class
 * itself, `_` a space (`\_` an underscore). Only a bracketed token that starts a class, holds no space, names `&` and
 * is followed by `:` counts, so an index such as `a[i]` or an at-rule variant such as `[@supports(..)]:` doesn't.
 */
function arbitraryVariants(text: string): string[] {
  const out: string[] = []
  if (!text.includes("]:") || !text.includes("&")) return out
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "[" || (i > 0 && !/[\s"'`:!({,]/.test(text[i - 1]))) continue
    let depth = 0
    let j = i
    for (; j < text.length && !/\s/.test(text[j]); j++) {
      if (text[j] === "\\") j++
      else if (text[j] === "[") depth++
      else if (text[j] === "]" && --depth === 0) break
    }
    const body = text.slice(i + 1, j)
    if (text[j] !== "]" || text[j + 1] !== ":" || !body.includes("&") || body.startsWith("@")) continue
    out.push(body.replace(/\\_|_/g, (m) => (m === "_" ? " " : "_")).replace(/&/g, ".x"))
    i = j
  }
  return out
}

/** Why a line's classes make Chrome invalidate a whole subtree, one line per shape; empty when they don't. */
function classShapes(text: string): string[] {
  const out = HAS_VARIANT.test(text) ? ["a group-has-* or peer-has-* variant"] : []
  for (const sel of arbitraryVariants(text)) out.push(...wholeSubtreeShapes(sel))
  return out
}

describe("no selector makes Chrome restyle a whole subtree on every DOM change (V-924)", () => {
  it("tells the shapes apart", () => {
    const flagged = [
      ".cx-conn > * + *",
      ".cx-app-list > * + *::before",
      ".sheet-group > * + * > [data-press=\"row\"]::before",
      ".doc-editor .ProseMirror > :is(h1, h2, h3, h4, h5, h6) + *",
      ".doc-editor .ProseMirror > :is(h1, h2, h3, h4, h5, h6):where(.heading-node, h2) + *",
      // A key beside an :is()/:where() of bare tags doesn't help: each tag argument is filed as a universal sibling.
      ".doc-editor .ProseMirror > :is(h1, h2, h3, h4, h5, h6):where(.heading-node) + *",
      ".doc-editor .ProseMirror > .heading-node:is(h1, h2, h3, h4, h5, h6) + *",
      ".heading-node:where(h1, h2) ~ *",
      ".a:is(.b, :where(h3)) + *",
      "h2 ~ *",
      ".g:has(.x) *",
      ".c:is(:where(.group\\/tile):has([data-ink-drawing]) *)",
      ".a, .b > * + *",
    ]
    const narrow = [
      ".cx-conn > :where(:not(:first-child))",
      ".doc-editor .ProseMirror > .heading-node + *",
      ".doc-editor .ProseMirror > :where(.heading-node) + *",
      ".a:is(.b, [data-c]) + *",
      ":is(h1, h2):where(.heading-node) + p",
      ".sheet-group > :where(:not(:first-child)) > [data-press=\"row\"]::before",
      "[data-app-scroller] > [data-large-title] + * > .sticky:first-child",
      ".ProseMirror > p + p",
      ".set-card > * + .set-row::before",
      ":is([data-vaul-drawer], .v3-dialog)[data-state=\"open\"] ~ :is([data-vaul-overlay], .v3-overlay)",
      ":where([data-stage-tile]):has([data-ink-drawing]) .pin",
      "[data-overlay]:has([data-sheet-body])",
      ".x:nth-child(2n+1)",
      ".md\\:p-2 + .y",
    ]
    for (const s of flagged) expect(wholeSubtreeShapes(s), s).not.toEqual([])
    for (const s of narrow) expect(wholeSubtreeShapes(s), s).toEqual([])
    const css = "/* a { */ .a > * + * {\n  content: \"}\";\n}\n@media (x) {\n  .b,\n  .c { color: red }\n}\n@media print {\n  :has(.p) > * { display: none }\n}\n.d {}"
    expect(selectorLists(css).map((r) => `${r.line} ${r.list}`)).toEqual(["1 .a > * + *", "5 .b,\n  .c", "11 .d"])

    // The class scan: group-has / peer-has, and arbitrary variants read as the selectors they compile to.
    const flaggedClasses = [
      '<div className="space-y-0 [&>*+*] ^mt-2">',
      'cn("p-2", "md ^[&_*~*] ^hidden")',
      "`![&>*+*] ^mt-0`",
      '"[&_li+*] ^mt-1 [.g:has(.x)_&_*] ^p-2"',
      '"group-has-[[data-x]]/tile ^hidden"',
      '"peer-has-checked ^block"',
    ]
    const narrowClasses = [
      '"[:where([data-stage-tile]):has([data-ink-drawing])_&] ^hidden"',
      '"[&_svg] ^size-4 [&>*] ^mt-2 [&>p+p] ^mt-1 [&_.a\\_b+*] ^p-1"',
      '"[@supports(display:grid)] ^grid [&:not(:first-child)] ^mt-2"',
      "const y = flags[a && b] ? x : z",
      "const y = rows[i]: number",
    ]
    // " ^" is a variant's colon: written whole, Tailwind would compile each fixture into the shipped stylesheet.
    const colon = (t: string) => t.replace(/ \^/g, ":")
    for (const t of flaggedClasses.map(colon)) expect(classShapes(t), t).not.toEqual([])
    for (const t of narrowClasses.map(colon)) expect(classShapes(t), t).toEqual([])
    expect(arbitraryVariants(colon('"[&>*+*] ^mt-2 [&_.a\\_b] ^p-1"'))).toEqual([".x>*+*", ".x .a_b"])
  })

  it("the app's and the components' stylesheets have none", () => {
    const found: string[] = []
    for (const file of sourceFiles(["app", "components"], /\.css$/)) {
      for (const { line, list } of selectorLists(readFileSync(file, "utf8"))) {
        for (const why of wholeSubtreeShapes(list)) found.push(`${file}:${line}: ${why}`)
      }
    }
    expect(found, "write `X > * + *` as `X > :where(:not(:first-child))`, and give a sibling or a :has() a subject Chrome can key").toEqual([])
  })

  it("no class is a group-has-* or peer-has-* variant, or an arbitrary variant of either shape", () => {
    const found: string[] = []
    const roots = ["app", "components", "hooks", "lib"]
    const ext = /\.(tsx?|jsx?|mjs)$/
    for (const file of [...sourceFiles(roots, ext), ...testFiles(roots, ext)]) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((text, i) => {
          for (const why of classShapes(text)) found.push(`${file}:${i + 1}: ${why}: ${text.trim().slice(0, 140)}`)
        })
    }
    expect(found, "name the subject with an arbitrary variant: `[:where([data-x]):has([data-y])_&]:hidden`").toEqual([])
  })
})
