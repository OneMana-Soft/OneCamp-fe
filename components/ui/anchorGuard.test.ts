import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * NO CARD IN THE CORNER (20 Oct 2026).
 *
 * A drag across the calendar's hours opened its new-event card in the
 * top-left corner of the screen. The card's anchor was the drag's ghost, held
 * by identity; the ghost unmounted as the drag ended, and the anchor's
 * `?? new DOMRect()` answered (0, 0). The tiptap menus' all-zero fallback did
 * the same while their decoration was off the page. A card that stands by
 * something other than its own trigger takes components/ui/anchor's
 * anchorTo, which measures afresh, finds what took the element's place, and
 * keeps the last rect that measured.
 *
 * It fails when a file outside components/ui/anchor.ts:
 *   1. builds a virtual anchor by hand (`getBoundingClientRect: () =>`), or
 *   2. falls back to an empty rect (`new DOMRect()`, a rect literal of zeros).
 * The baseline is zero, and stays so: the block menu, the colour grid, the
 * technical blocks' panel and the reaction picker came onto the helper on
 * 20 Oct, and the composer's slash and mention menus stand by the editor's
 * own box when Tiptap has no place for the typed text.
 */

const ROOTS = ["app", "components", "hooks", "lib", "store"]
const OWN = "components/ui/anchor.ts"

/** A file that may build its own anchor, with why. Empty: keep it so. */
const BASELINE: Record<string, string> = {}

export function anchorFindings(src: string): string[] {
  const out: string[] = []
  if (/getBoundingClientRect\s*:\s*\(\s*\)\s*=>/.test(src)) out.push("hand-built virtual anchor")
  if (/new DOMRect\(\s*\)/.test(src)) out.push("empty DOMRect fallback")
  if (/\{\s*bottom:\s*0,\s*height:\s*0,\s*left:\s*0,\s*right:\s*0,\s*top:\s*0,\s*width:\s*0/.test(src)) out.push("all-zero rect literal")
  return out
}

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) sources(path, out)
    else if (/\.(tsx?|mjs)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) out.push(path)
  }
  return out
}

describe("popover anchors", () => {
  it("bites on the patterns that put a card in the corner", () => {
    expect(anchorFindings("virtualRef={{ current: { getBoundingClientRect: () => el?.getBoundingClientRect() ?? new DOMRect() } }}")).toEqual(["hand-built virtual anchor", "empty DOMRect fallback"])
    expect(anchorFindings("const FALLBACK = { bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0, x: 0, y: 0 }")).toEqual(["all-zero rect literal"])
    expect(anchorFindings("const at = useMemo(() => ({ current: anchorTo(el) }), [el])")).toEqual([])
  })

  it("every virtual anchor goes through components/ui/anchor", () => {
    const root = join(__dirname, "..", "..")
    const found: string[] = []
    for (const r of ROOTS) {
      let files: string[] = []
      try {
        files = sources(join(root, r))
      } catch {
        continue
      }
      for (const file of files) {
        const rel = relative(root, file)
        if (rel === OWN || rel.startsWith("lib/testing/") || BASELINE[rel]) continue
        for (const f of anchorFindings(readFileSync(file, "utf8"))) found.push(`${rel}: ${f}`)
      }
    }
    expect(found).toEqual([])
  })

  it("keeps no baseline entry that has nothing left to excuse", () => {
    const root = join(__dirname, "..", "..")
    const stale = Object.keys(BASELINE).filter((rel) => {
      try {
        return anchorFindings(readFileSync(join(root, rel), "utf8")).length === 0
      } catch {
        return true
      }
    })
    expect(stale).toEqual([])
  })
})
