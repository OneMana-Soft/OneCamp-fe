import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "fs"

import { chainOf, packageOf, walk } from "../../../scripts/fluidity/reach.mjs"

// What opening a doc downloads on top of Home (docs programme A2; I20: the doc
// route adds at most 300 KB gzip over Home, and heavy libraries load lazily).
//
// The weight itself, in gzip bytes of script, is measured on a production
// build by scripts/fluidity/docs.mjs (routeKbOverHome in doc-budgets.json,
// G-PERF). This test holds the static import path that weight comes from: it
// walks the doc route's static imports beyond Home's (a dynamic import()
// starts a chunk of its own, so it isn't followed) and fails, naming the
// chain, when a heavy library is reached that wasn't before, and when the
// source reached grows past its ceiling. Both only ever go down: A1 makes the
// doc-only blocks lazy, and then deletes their lines below.

const HOME = ["app/layout.tsx", "app/app/layout.tsx", "app/app/home/page.tsx"]
const DOC_ROUTE = "app/app/doc/[doc-id]/page.tsx"

/**
 * Heavy pieces the doc route still loads with the page, and who makes each
 * lazy. Delete a line when it goes; the test says when one has. A1 made the
 * last of them lazy (12 Oct 2026): code highlighting, the table grid, the
 * doc-only embeds and the phone's AI sheet load when they are needed, and
 * NEVER and NEVER_FILES below keep them off the page.
 */
const EAGER_TODAY: Record<string, string> = {}

/**
 * Reached only through the AI edition's doc panel. An edition without it (the
 * public main) never reaches them, which is not the same as A1 making them lazy.
 */
const AI_PANEL = "components/ai/DocAiAssistantPanel.tsx"
const AI_EDITION_ONLY = new Set([AI_PANEL, "framer-motion"])

/** Never on the doc route's static path. */
const NEVER = [
  "mqtt", "livekit-client", "@livekit/", "@excalidraw/", "y-indexeddb", "highlight.js", "recharts",
  // Lazy since A1: with the first code block, a table embed's grid, the phone's AI sheet.
  "lowlight", "@tiptap/extension-code-block-lowlight", "@tanstack/react-virtual", "react-day-picker", "framer-motion",
]
/** Files that load when they are needed, never with a doc's page (A1). */
const NEVER_FILES = [
  "components/ai/DocAiAssistantPanel.tsx",
  "components/table/DataTableGrid.tsx",
  "components/minimal-tiptap/extensions/poll/poll-view.tsx",
  "components/minimal-tiptap/extensions/chart-embed/chart-embed-view.tsx",
  "components/minimal-tiptap/extensions/diff-embed/diff-embed-view.tsx",
  "components/minimal-tiptap/extensions/recording-embed/recording-embed-view.tsx",
  // The clipboard's Markdown writer (A7's codec) loads on idle or at the first selection.
  "components/minimal-tiptap/extensions/clipboard-markdown/clipboardMarkdownWriter.ts",
  "lib/codec/markdown.ts",
  // The trash's client loads with the page chrome's lazy pieces (B6: TrashedBanner, the breadcrumbs, More's actions).
  "services/docGraphService.ts",
  // The tables service comes with the doc's first new table (docInput), 17 Oct 2026.
  "services/tableService.ts",
]

/**
 * Source the doc route reaches beyond Home: 825 KB on 12 Oct 2026, on beta
 * with the docs P0 (794 KB of it without A2's session). It merged together
 * with A0 and A7 at 922 KB (A0's quick wins, A7's codec through the paste
 * path). A1 brought it to 743 KB the same day: the doc-only blocks load with
 * the doc's editor, the codec on idle or at the first selection, the phone's
 * AI sheet when it opens, DocDeleted's restore client when Restore shows.
 * May only go down. It lives in the one table of route ceilings
 * (scripts/fluidity/route-ceilings.json, beyondHome), with every route's own.
 */
const DOC_ROUTE_SOURCE_CEILING: number = JSON.parse(readFileSync("scripts/fluidity/route-ceilings.json", "utf8")).beyondHome[DOC_ROUTE].source

// The one walker of the first-load guards (scripts/fluidity/reach.mjs).
/** Files reached by static import (with who imported each) and packages (with their first importer). */
function reach(entries: string[]) {
  const walked = walk(entries) as { files: Map<string, string | null>; packages: Array<[string, string]> }
  const packages = new Map<string, string>()
  for (const [spec, file] of walked.packages) {
    const p = packageOf(spec) as string
    if (!packages.has(p)) packages.set(p, file)
  }
  return { files: walked.files, packages }
}

const chain = (files: Map<string, string | null>, from: string | null): string => (from ? (chainOf(files, from) as string) : "")

const home = reach(HOME)
const doc = reach([DOC_ROUTE])
const docOnlyFiles = [...doc.files.keys()].filter((f) => !home.files.has(f))
const docOnlyPackages = [...doc.packages.keys()].filter((p) => !home.packages.has(p))

describe("opening a doc", () => {
  it("brings no heavy library it didn't before, naming the chain if one comes back", () => {
    const heavy = [
      ...docOnlyPackages.filter((p) => p in EAGER_TODAY || NEVER.some((n) => p === n.replace(/\/$/, "") || p.startsWith(n))).map((p) => ({ what: p, chain: chain(doc.files, doc.packages.get(p)!) })),
      ...docOnlyFiles.filter((f) => f in EAGER_TODAY).map((f) => ({ what: f, chain: chain(doc.files, f) })),
    ]
    const unexpected = heavy.filter((h) => !(h.what in EAGER_TODAY)).map((h) => `${h.what}: ${h.chain}`)
    expect(unexpected, "a heavy library is on the doc route's static path again").toEqual([])
    const back = docOnlyFiles.filter((f) => NEVER_FILES.includes(f)).map((f) => `${f}: ${chain(doc.files, f)}`)
    expect(back, "a file that loads when needed is on the doc route's static path again").toEqual([])
    const aiEdition = existsSync(AI_PANEL)
    const gone = Object.keys(EAGER_TODAY).filter((k) => !heavy.some((h) => h.what === k) && (aiEdition || !AI_EDITION_ONLY.has(k)))
    expect(gone, "these are lazy now: delete their lines from EAGER_TODAY so they stay lazy").toEqual([])
  })

  it("keeps the source it reaches beyond Home under its ceiling", () => {
    let bytes = 0
    for (const f of docOnlyFiles) bytes += readFileSync(f).length
    expect(bytes, `the doc route reaches ${bytes} bytes of source beyond Home (ceiling ${DOC_ROUTE_SOURCE_CEILING}); lower the ceiling when it drops`).toBeLessThanOrEqual(
      DOC_ROUTE_SOURCE_CEILING,
    )
  })

  it("keeps the live session and the prefetch off Home's first load: they load on intent", () => {
    for (const f of ["lib/collabSession.ts", "lib/collabSocket.ts", "lib/docPrefetch.ts"]) expect(home.files.has(f), `${f}: ${chain(home.files, f)}`).toBe(false)
    expect(home.packages.has("@hocuspocus/provider"), chain(home.files, home.packages.get("@hocuspocus/provider") ?? null)).toBe(false)
    // The sidebar's links start it with import(), which this walk doesn't follow.
    expect(readFileSync("components/navigationBar/desktop/IntentLink.tsx", "utf8")).toMatch(/import\("@\/lib\/docPrefetch"\)/)
  })

  it("has a budget for the weight the build adds, held by docs.mjs", () => {
    const budgets = JSON.parse(readFileSync("scripts/fluidity/doc-budgets.json", "utf8"))
    const weight = budgets.budgets.routeKbOverHome
    expect(weight.target).toBe(300)
    expect(weight.max).toBeGreaterThanOrEqual(weight.target)
  })
})
