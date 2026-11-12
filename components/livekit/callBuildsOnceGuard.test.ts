import { describe, expect, it } from "vitest"
import { readdirSync } from "fs"
import path from "path"

import { dynamicImportRe, resolve, routeEntries, routeReach, sourceOf, walk } from "../../scripts/fluidity/reach.mjs"

// The call builds once (UX-CALLS-H7).
//
// Every call surface draws the call through one lazy part, LazyCall's
// import() of VideoConference. Turbopack still builds that lazy group once for
// each different set of its modules the page has already loaded: a page that
// loads services/callService before the call gets a call without it, a page
// that doesn't gets one with it, and the two are separate copies of the same
// hundred-odd modules (beta d958e5e51: three copies of the AI composer, the
// call rings and the rest, one per kind of call page). So every signed-in call
// surface must have loaded the same part of the call before it, and every
// guest one the same part; a module only some of them load belongs to all of
// them or to none (the call's own code, a file of its own).
//
// A module here is a file, an icon (lib/icons re-exports lucide one icon per
// module) or a package, as reach.mjs walks them; the call is what
// VideoConference reaches, its own lazy parts included (theirs split the same
// way).

const CALL = "components/livekit/VideoConference.tsx"
const ENTRY = "components/livekit/LazyCall.tsx"
const ICONS = "lib/icons.ts"
const iconImport = /import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/icons["']/g

/** What `entries` load as Turbopack counts modules: files, each icon from lib/icons, packages. */
function modules(entries: string[], dynamic = false): Set<string> {
  const { files, packages } = walk(entries, { dynamic })
  const out = new Set<string>([...files.keys()].filter((f) => f !== ICONS))
  for (const [spec] of packages) out.add(`package ${spec}`)
  for (const f of files.keys()) {
    for (const m of sourceOf(f).matchAll(iconImport)) {
      for (const name of m[1].split(",")) {
        const icon = name.trim().split(/\s+as\s+/)[0]
        if (icon && !icon.startsWith("type ")) out.add(`icon ${icon}`)
      }
    }
  }
  return out
}

function pages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? pages(path.join(dir, d.name)) : d.name === "page.tsx" ? [path.join(dir, d.name)] : [],
  )
}

const callPages = pages("app").filter((p) => routeReach(p).has(ENTRY))
const shell = routeEntries("app/app/meet/room/page.tsx").slice(1)

/** A call surface that isn't a page: the lazy chain that leads to it, after the shell. */
const LAZY_SURFACES: Record<string, string[]> = {
  // The call beside a page: the shell's split pane (components/split/lazy) opens CallView.
  "split pane": [...shell, "components/split/SplitPane.tsx", "components/livekit/CallView.tsx"],
}

const surfaces: Record<string, { signedIn: boolean; entries: string[] }> = {
  ...Object.fromEntries(callPages.map((p) => [p, { signedIn: p.startsWith("app/app/"), entries: routeEntries(p) }])),
  ...Object.fromEntries(Object.entries(LAZY_SURFACES).map(([k, entries]) => [k, { signedIn: true, entries }])),
}

/**
 * What one surface loads first that the others don't, still: each one gives that surface a copy of the
 * call's code of its own. The list only shrinks (a test below fails when an entry no longer splits).
 *   - The split pane's own code (components/split/paneLook's chat glyph, the docs endpoints its doc
 *     panes read) is loaded before its CallView; the call's dock and boards use them too.
 *   - The room link's door (components/guest/SecretCard) shows a room password with Eye/EyeOff; the
 *     call's own parts load EyeOff too (Eye only the other edition's call does).
 */
const KNOWN: Record<string, string[]> = {
  "split pane": ["icon MessageSquare", "services/endpoints/docs.ts"],
  "app/r/[slug]/page.tsx": ["icon EyeOff"],
}

const call = modules([CALL], true)
const loadedFirst = (n: string) => new Set([...modules(surfaces[n].entries)].filter((m) => call.has(m)))

/** For each module of the call some of `names` have loaded first and some haven't (KNOWN aside): who has. */
function split(names: string[]): string[] {
  const loaded = Object.fromEntries(names.map((n) => [n, loadedFirst(n)]))
  for (const n of names) for (const m of KNOWN[n] ?? []) loaded[n].delete(m)
  const all = new Set(Object.values(loaded).flatMap((s) => [...s]))
  return [...all]
    .filter((m) => names.some((n) => !loaded[n].has(m)))
    .sort()
    .map((m) => `${m}: loaded first by ${names.filter((n) => loaded[n].has(m)).join(", ")}; not by ${names.filter((n) => !loaded[n].has(m)).join(", ")}`)
}

describe("the call builds once", () => {
  it("finds the call surfaces: the meet pages, the guest door and room links, the split pane", () => {
    expect(callPages).toEqual(expect.arrayContaining(["app/app/meet/ch/[channelId]/page.tsx", "app/guest/m/[token]/page.tsx", "app/r/[slug]/page.tsx"]))
  })

  it("loads the call's code through one import(): LazyCall's", () => {
    const others = walk(callPages.flatMap((p) => routeEntries(p)).concat(Object.values(LAZY_SURFACES).flat()), { dynamic: true })
    const importers = [...others.files.keys()].filter((f) =>
      [...sourceOf(f).matchAll(dynamicImportRe)].some((m) => resolve(m[1], f) === CALL),
    )
    expect(importers).toEqual([ENTRY])
  })

  it("every lazy way in to the call is a listed surface", () => {
    const lazyIn = walk(callPages.flatMap((p) => routeEntries(p)).concat(shell), { dynamic: true })
    const ways = [...lazyIn.files.keys()].filter((f) =>
      [...sourceOf(f).matchAll(dynamicImportRe)].some((m) => {
        const to = resolve(m[1], f)
        return !!to && to !== CALL && walk([to]).files.has(ENTRY)
      }),
    )
    // components/split/SplitPane opens CallView: LAZY_SURFACES["split pane"].
    expect(ways).toEqual(["components/split/SplitPane.tsx"])
  })

  it("every signed-in call surface has loaded the same part of the call", () => {
    expect(split(Object.keys(surfaces).filter((n) => surfaces[n].signedIn))).toEqual([])
  })

  it("every known split still splits (else take it off KNOWN)", () => {
    const stale = Object.entries(KNOWN).flatMap(([n, ms]) => ms.filter((m) => !loadedFirst(n).has(m)).map((m) => `${n}: ${m}`))
    expect(stale).toEqual([])
  })

  it("every guest call surface has loaded the same part of the call", () => {
    expect(split(Object.keys(surfaces).filter((n) => !surfaces[n].signedIn))).toEqual([])
  })
})
