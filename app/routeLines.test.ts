import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import { firstScreen, reach, routeReach, sourceBytes } from "../scripts/fluidity/reach.mjs"
import { KB, headroom, lineFor, lineProblem, routeWeights } from "../scripts/fluidity/routes.mjs"

// A route's lines count what ships with its page (V-49, main's ruling 29 Oct
// 2026). A page's own reach left out the layouts and boundaries above it, so
// moving an import from a page into its layout lowered the page's line while
// every visit still loaded it (V-46 cut 303 KB of "reach" and shipped nothing
// less). The source line is now the route's, the page with every layout and
// boundary above it, once each; the build's line counts every entry segment on
// the page's path, metadata entries included, because the page's HTML lists
// their chunks too. Built in a folder of its own, beside nothing.

const dir = mkdtempSync(path.join(tmpdir(), "routeLines-"))
const put = (rel: string, text: string) => {
  const file = path.join(dir, rel)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, text)
  return file
}
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const HEAVY = put("lib/heavy.ts", `export const HEAVY = "${"x".repeat(4000)}"\n`)
const APP = path.join(dir, "app")
put("app/layout.tsx", "export default function Root({ children }: { children: unknown }) {\n  return children\n}\n")
// The same import, in a page, and then moved into that page's layout.
const inPage = put("app/a/page.tsx", 'import { HEAVY } from "../../lib/heavy"\nexport default function Page() {\n  return HEAVY\n}\n')
put("app/a/layout.tsx", "export default function Layout({ children }: { children: unknown }) {\n  return children\n}\n")
const inLayout = put("app/b/page.tsx", "export default function Page() {\n  return null\n}\n")
put("app/b/layout.tsx", 'import { HEAVY } from "../../lib/heavy"\nexport default function Layout({ children }: { children: unknown }) {\n  return [HEAVY, children]\n}\n')
put("app/b/error.tsx", "export default function Failed() {\n  return null\n}\n")

describe("a route's source line", () => {
  const pageLine = (page: string) => sourceBytes(reach(page)) as number
  const routeLine = (page: string) => sourceBytes(routeReach(page, APP)) as number

  it("doesn't drop when an import moves from the page into its layout, as the page's own line did", () => {
    expect(pageLine(inPage) - pageLine(inLayout), "the page's own line drops by what moved").toBeGreaterThanOrEqual(4000)
    expect(Math.abs(routeLine(inPage) - routeLine(inLayout)), "the route's line keeps it").toBeLessThan(200)
  })

  it("is the page with every layout and boundary in its folder and above it, once each", () => {
    const files = [...(routeReach(inLayout, APP) as Map<string, string | null>).keys()].map((f) => path.relative(dir, f)).sort()
    expect(files).toEqual(["app/b/error.tsx", "app/b/layout.tsx", "app/b/page.tsx", "app/layout.tsx", path.relative(dir, HEAVY)])
  })
})

// Two pages under one layout, before and after the import moves from the first
// page into the layout they share; and a page under the signed-in shell, whose
// layout brings it.
put("app/c/layout.tsx", "export default function Layout({ children }: { children: unknown }) {\n  return children\n}\n")
put("app/c/one/page.tsx", 'import { HEAVY } from "../../../lib/heavy"\nexport default function Page() {\n  return HEAVY\n}\n')
const otherBefore = put("app/c/two/page.tsx", "export default function Page() {\n  return null\n}\n")
put("app/d/layout.tsx", 'import { HEAVY } from "../../lib/heavy"\nexport default function Layout({ children }: { children: unknown }) {\n  return [HEAVY, children]\n}\n')
put("app/d/one/page.tsx", "export default function Page() {\n  return null\n}\n")
const otherAfter = put("app/d/two/page.tsx", "export default function Page() {\n  return null\n}\n")
put("app/app/layout.tsx", 'import { HEAVY } from "../../lib/heavy"\nexport default function Shell({ children }: { children: unknown }) {\n  return [HEAVY, children]\n}\n')
const inShell = put("app/app/e/page.tsx", "export default function Page() {\n  return null\n}\n")

describe("a first screen's walk", () => {
  const has = (files: unknown, file: string) => (files as Map<string, unknown>).has(file)
  const routeLine = (page: string) => sourceBytes(routeReach(page, APP)) as number

  // A guard that a lazy file or a heavy library stays off a page's first screen walked the page alone, so a file
  // its layout imports escaped it, as bytes escaped the page's own line (CR-79 on V-49).
  it("sees what a page's layout brings, and walks any other file alone", () => {
    expect(has(reach(inLayout), HEAVY), "the page alone").toBe(false)
    expect(has(firstScreen(inLayout, APP), HEAVY), "the page's first screen").toBe(true)
    expect([...(firstScreen(HEAVY, APP) as Map<string, unknown>).keys()], "a file that isn't a page").toEqual([HEAVY])
  })

  // CR-79's ruling (29 Oct 2026): a page's first screen is its route beyond the shared shell. A move into a layout
  // two pages share raises the other page's route line, and its first screen sees it.
  it("sees a move into a layout two pages share, on the other page's line and first screen", () => {
    expect(routeLine(otherAfter) - routeLine(otherBefore), "the other page's route line rises by what moved").toBeGreaterThanOrEqual(4000)
    expect(has(firstScreen(otherBefore, APP), HEAVY), "before, the other page's first screen").toBe(false)
    expect(has(firstScreen(otherAfter, APP), HEAVY), "after, the other page's first screen").toBe(true)
  })

  // The shell ships on every page under it, so its own guards hold it, not each page's: a page's first screen
  // leaves it out, and the page's route line counts it.
  it("leaves the shell's layouts to the route line", () => {
    expect(has(firstScreen(inShell, APP), HEAVY), "the page's first screen").toBe(false)
    expect(has(routeReach(inShell, APP), HEAVY), "the page's route").toBe(true)
  })
})

describe("a route's shipped line", () => {
  const chunk = (name: string) => [`/static/chunks/${name}.js`]
  put("next/build-manifest.json", JSON.stringify({ rootMainFiles: ["/static/chunks/main.js"] }))
  const segments = {
    "[project]/app/layout": chunk("root-layout"),
    "[project]/app/not-found": chunk("not-found"),
    "[project]/app/global-error": chunk("global-error"),
    "[project]/app/x/template": chunk("x-template"),
    "[project]/app/x/loading": chunk("x-loading"),
    "[project]/app/x/error": chunk("x-error"),
    "[project]/app/x/page": chunk("x-page"),
    // Metadata entries ship a chunk the HTML lists, named as Next 16 names them.
    "[project]/app/twitter-image--metadata": chunk("root-twitter"),
    "[project]/app/x/opengraph-image--metadata": chunk("x-og"),
    // Never counted: entries on another route's path.
    "[project]/app/y/layout": chunk("y-layout"),
    "[project]/app/y/opengraph-image--metadata": chunk("y-og"),
  }
  put("next/server/app/x/page_client-reference-manifest.js", `globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {}; globalThis.__RSC_MANIFEST["/x/page"] = ${JSON.stringify({ entryJSFiles: segments })}`)

  it("counts every entry segment on the page's path, metadata included, and never another route's", () => {
    // The runtime; the root's layout, not-found, global-error and twitter image; the page's template, loading,
    // error, page and opengraph image.
    expect((routeWeights(path.join(dir, "next")) as Map<string, { files: number }>).get("app/x/page.tsx")?.files).toBe(10)
  })
})

// Every route line is its measure plus headroom (main's V-49 amendment, 29 Oct 2026): exact lines with no room froze
// every route, since a feature that adds a byte had to find equal savings first. The room is max(2 KB, 1%) for a
// source line (bytes) and max(1 KB, 1%) for a gzip line (KB). Lines never rise, and slack can't build up again: a
// line more than twice its headroom above its measure fails, saying where to ratchet it down to.
describe("a route line's headroom", () => {
  it("is max(2 KB, 1%) above a source measure and max(1 KB, 1%) above a gzip one", () => {
    expect(headroom("source", 100_000)).toBe(2 * KB)
    expect(headroom("source", 1_000_000)).toBe(10_000)
    expect(headroom("gzipKB", 50)).toBe(1)
    expect(headroom("gzipKB", 300)).toBe(3)
    expect(lineFor("source", 1_000_000)).toBe(1_010_000)
    expect(lineFor("gzipKB", 300)).toBe(303)
  })

  it("fails a line with stale slack, more than twice its headroom above its measure, naming the line to ratchet to", () => {
    const measure = 1_000_000
    const room = headroom("source", measure)
    expect(lineProblem("source", measure, lineFor("source", measure)), "measure plus headroom").toBeNull()
    expect(lineProblem("source", measure, measure + 2 * room), "exactly twice the headroom").toBeNull()
    expect(lineProblem("source", measure, measure + 2 * room + 1), "one byte more").toMatch(/ratchet this line down to 1010000/)
    expect(lineProblem("gzipKB", 300, 306), "a gzip line twice its headroom above").toBeNull()
    expect(lineProblem("gzipKB", 300, 307), "a gzip line one KB more").toMatch(/ratchet this line down to 303/)
  })

  it("fails a measure over its line", () => {
    expect(lineProblem("source", 1_000_001, 1_000_000)).toMatch(/over its line 1000000/)
    expect(lineProblem("gzipKB", 304, 303)).toMatch(/over its line 303/)
  })
})
