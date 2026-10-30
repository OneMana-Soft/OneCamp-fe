import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * NO :has() AND NO BARE :not() IN A SELECTOR'S KEY (21 Oct 2026).
 *
 * Chrome files every rule under its selector's rightmost compound, its key. A
 * key with a class, an id, a tag or an attribute of its own is tried only on
 * the elements that have one. A key with none of those is tried on every
 * element, in every style recalculation, on every page. A :has() in the key
 * is evaluated for each element tried, and looked at again whenever anything
 * under its subject changes.
 *
 * app/overlay.css's box between an overlay's root and its body,
 * `[data-overlay] > :not([data-overlay-body], [data-sheet-base]):has(...)`,
 * was the app's most expensive selector. It took 11% of all selector matching
 * on a phone's list scroll (123,935 tries, no match; FLUIDITY-LEAD-2) and 13%
 * of the phone's account sheet opening (fluid-16). The overlay's body now
 * marks the boxes it needs (components/ui/overlay: data-overlay-column,
 * data-overlay-holds-body), and the rules read those marks.
 *
 * KNOWN holds the rules that had a :has() or a bare :not() in their key when
 * this guard came, by file, with whose they are. The list may only shrink. A
 * rule taken off must leave it, and no rule may join it.
 *
 * One guard reads app's CSS for what a style change costs: L-1's, in
 * lib/ui/dnd.test.ts ("the document's data-dragging", 29e184fe4, on its way
 * to beta). Once it is there, this one folds into it.
 */
const KNOWN: Record<string, string[]> = {
  "app/globals.css": [
  ],
  "app/interaction.css": [
    // The interaction layer's hover, press, reveal and edge-fade states.
    '[data-interactive]:hover:not([data-interactive="card"], [data-interactive="field"], [data-interactive="link"], [data-interactive="avatar"], [data-interactive="block"], [data-interactive="toggle"], [data-interactive="cell"], [data-interactive="item"], [aria-disabled="true"], :disabled, [data-disabled=""], [data-disabled="true"]):not(:has([data-interactive]:hover)):where(:not([data-list-moving] [data-interactive]))',
    ':is([data-interactive="message"], [data-interactive="row"][data-quiet]):hover:not([aria-disabled="true"]):not(:has([data-interactive]:hover)):where(:not([data-list-moving] [data-interactive]))',
    ':is([data-interactive="button"], [data-interactive="icon"], [data-interactive="chip"]):active:not([aria-disabled="true"], :disabled, [aria-busy="true"])',
    '[data-reveal] [data-tools]:is([data-state="open"], :has([data-state="open"]))',
    '[data-edge-fade] > :not([aria-hidden="true"])',
  ],
  "app/phone.css": [
    // The phone's sheets: a half sheet whose field has the keyboard.
    'html[data-keyboard="open"] [data-vaul-drawer][data-v3-sheet][data-detent="half"]:has(input:focus)',
  ],
}

/** Splits at the top level only: never inside (), [] or a quoted string. */
function topLevel(text: string, at: (c: string) => boolean): string[] {
  const out: string[] = []
  let depth = 0
  let quote = ""
  let from = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      if (c === quote) quote = ""
    } else if (c === '"' || c === "'") quote = c
    else if (c === "(" || c === "[") depth++
    else if (c === ")" || c === "]") depth--
    else if (depth === 0 && at(c)) {
      out.push(text.slice(from, i))
      from = i + 1
    }
  }
  out.push(text.slice(from))
  return out
}

/** The selector's key: its rightmost compound, after the last combinator. */
export function keyOf(selector: string): string {
  const parts = topLevel(selector.trim(), (c) => c === " " || c === ">" || c === "+" || c === "~").filter((p) => p.trim())
  return (parts.at(-1) ?? "").trim()
}

/** Why a selector's key is one Chrome tries everywhere or checks again on every change, or null. */
export function offence(selector: string): string | null {
  const key = keyOf(selector)
  if (key.includes(":has(")) return "a :has() in its key"
  // What the key holds at its own level: a tag, a class, an id, an attribute or & (a nested rule's parent).
  const own = topLevel(key, () => false)[0].replace(/\((?:[^()]|\([^()]*\))*\)/g, "()").replace(/::[\w-]+/g, "")
  const keyed = /^[a-zA-Z&]/.test(own) || /[.#[]/.test(own.replace(/\[[^\]]*\]/g, "[x]"))
  if (/:not\(/.test(own) && !keyed) return "a bare :not() as its key"
  return null
}

/** Every selector of every style rule in a stylesheet, each whole (lists split at their commas). */
export function selectorsOf(css: string): string[] {
  const out: string[] = []
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{};]+)\{/g)) {
    const prelude = m[1].trim()
    if (!prelude || prelude.startsWith("@") || /^(from|to|\d+(\.\d+)?%)(\s*,\s*(from|to|\d+(\.\d+)?%))*$/.test(prelude)) continue
    for (const s of topLevel(prelude, (c) => c === ",")) if (s.trim()) out.push(s.trim().replace(/\s+/g, " "))
  }
  return out
}

describe("a selector's key", () => {
  it("holds no :has() and no bare :not() in app/*.css, beyond the rules this guard found", () => {
    const root = join(__dirname, "..")
    const found: Record<string, string[]> = {}
    for (const name of readdirSync(join(root, "app")).filter((n) => n.endsWith(".css")).sort()) {
      const file = `app/${name}`
      const hits = selectorsOf(readFileSync(join(root, file), "utf8")).filter((s) => offence(s))
      if (hits.length) found[file] = hits
    }
    const joined = Object.entries(found).flatMap(([f, ss]) => ss.filter((s) => !(KNOWN[f] ?? []).includes(s)).map((s) => `${f}: ${s} (${offence(s)})`))
    expect(joined, "a rule keyed on nothing, or on a :has(): key it on a class or an attribute the element carries").toEqual([])
    const gone = Object.entries(KNOWN).flatMap(([f, ss]) => ss.filter((s) => !(found[f] ?? []).includes(s)).map((s) => `${f}: ${s}`))
    expect(gone, "these no longer offend: take them off KNOWN").toEqual([])
  })

  it("keeps app/overlay.css's own at none: the overlay marks its column instead", () => {
    expect(selectorsOf(readFileSync(join(__dirname, "overlay.css"), "utf8")).filter((s) => offence(s))).toEqual([])
  })

  it("bites: a :has() in the key, a bare :not(), and nothing else", () => {
    expect(offence("[data-overlay] > :not([data-overlay-body], [data-sheet-base]):has(> [data-overlay-body])")).toBe("a :has() in its key")
    expect(offence('[data-overlay="float"]:has(> [data-overlay-body])')).toBe("a :has() in its key")
    expect(offence("html:has([data-app-shell])")).toBe("a :has() in its key")
    expect(offence('[data-reveal] [data-tools]:is([data-state="open"], :has([data-state="open"]))')).toBe("a :has() in its key")
    expect(offence('[data-edge-fade] > :not([aria-hidden="true"])')).toBe("a bare :not() as its key")
    expect(offence(':is([data-interactive="icon"]):active:not(:disabled)')).toBe("a bare :not() as its key")
    // Keyed on its own attribute, class or tag, or the :has() further left: fine.
    expect(offence('[data-overlay="float"][data-overlay-holds-body]')).toBeNull()
    expect(offence("[data-overlay]:has([data-overlay-body][data-more-above]) [data-overlay-header]")).toBeNull()
    expect(offence(".row:not(.quiet)")).toBeNull()
    expect(offence('button:not([aria-disabled="true"])')).toBeNull()
    expect(offence('[data-label]:not([data-type])')).toBeNull()
    expect(offence("&:has([data-rehype-pretty-code-title]) [data-slot=\"copy-button\"]")).toBeNull()
    expect(offence(":where([data-interactive] [data-label]:not([data-type]))")).toBeNull()
    expect(selectorsOf("a, b > c:hover { x: y } @media (x) { d { e: f } } @keyframes k { from { a: b } 50% { a: c } }")).toEqual(["a", "b > c:hover", "d"])
  })
})
