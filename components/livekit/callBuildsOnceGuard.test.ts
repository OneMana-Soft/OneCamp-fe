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
 *   - The room link's door (components/guest/SecretCard) shows a room password with Eye/EyeOff, which
 *     the AI's artifacts in a guest's call use.
 */
const KNOWN: Record<string, string[]> = {
  "split pane": ["icon MessageSquare", "services/endpoints/docs.ts"],
  "app/r/[slug]/page.tsx": ["icon Eye", "icon EyeOff"],
}

const call = modules([CALL], true)
/** What surface `n` has loaded of `of` (the call, or a lazy part of it) with its first load. */
const loadedFirst = (n: string, of = call) => new Set([...modules(surfaces[n].entries)].filter((m) => of.has(m)))

/** The files, from every call surface on, that make an import() of `target`. */
function importersOf(target: string): string[] {
  const reach = walk(callPages.flatMap((p) => routeEntries(p)).concat(Object.values(LAZY_SURFACES).flat()), { dynamic: true })
  return [...reach.files.keys()].filter((f) => [...sourceOf(f).matchAll(dynamicImportRe)].some((m) => resolve(m[1], f) === target)).sort()
}

/** For each module of `of` (the call) some of `names` have loaded first and some haven't (the call's KNOWN aside): who has. */
function split(names: string[], of = call): string[] {
  const loaded = Object.fromEntries(names.map((n) => [n, loadedFirst(n, of)]))
  if (of === call) for (const n of names) for (const m of KNOWN[n] ?? []) loaded[n].delete(m)
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
    expect(importersOf(CALL)).toEqual([ENTRY])
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

  // zoom-09 C1: the notice that asks first is a guest's alone. Its import() inside the call built a copy of it, and of
  // the dialog it draws with, for the signed-in call and another for the guest's (main, 12 Nov 17:4x), though no member
  // ever opens it. One import(), reached from the guest's pages alone, builds it once.
  it("imports the notice that asks once, reached from the guest's call pages alone, so it builds once (zoom-09)", () => {
    const ASKED = "components/livekit/AskedNotice.tsx"
    const names = Object.keys(surfaces)
    const guests = names.filter((n) => !surfaces[n].signedIn)
    const reaches = (n: string) => walk(surfaces[n].entries, { dynamic: true }).files.has(ASKED)
    expect(guests.length).toBeGreaterThan(0)
    expect(guests.filter((n) => !reaches(n))).toEqual([])
    expect(names.filter((n) => surfaces[n].signedIn && reaches(n))).toEqual([])
    const all = walk(names.flatMap((n) => surfaces[n].entries), { dynamic: true })
    const importers = [...all.files.keys()].filter((f) => [...sourceOf(f).matchAll(dynamicImportRe)].some((m) => resolve(m[1], f) === ASKED))
    expect(importers).toEqual(["components/livekit/LazyAskedNotice.tsx"])
  })

  it("every guest call surface has loaded the same part of the call", () => {
    expect(split(Object.keys(surfaces).filter((n) => !surfaces[n].signedIn))).toEqual([])
  })
})

// The effects' lazy parts build once too (UX-CALLS-H4b, meet-09), by the same
// rule: a lazy part is built once for each different set of its modules
// already loaded where its import() is made. So the effects' chooser (the
// picker, the backdrops, one's own pictures) and the made background's part
// (the composer's frame and its own import()) are imported from every call
// surface's first load (components/livekit/callDevices, which the green room
// and the call already load: no page gains a first-load module, which would
// re-cut the meet pages' shared chunk), not from the green room's button or
// the call's panel, whose
// chunks load different parts of them (the call's Trash2 and calls endpoints,
// the green room's camera loader). The chooser then builds once for members
// and once for guests (the shell loads its radio tiles first); the made part
// once for all (`apart`: members and guests may load different parts of it).
const EFFECTS = "components/call/effects"
const EFFECTS_HOST = "components/livekit/callDevices.ts"
const EFFECTS_PARTS: { part: string; apart: boolean }[] = [
  { part: `${EFFECTS}/EffectsChooser.tsx`, apart: true },
  { part: `${EFFECTS}/madePart.tsx`, apart: false },
]

describe("the effects' lazy parts build once", () => {
  for (const { part, apart } of EFFECTS_PARTS) {
    const name = path.basename(part, ".tsx")
    it(`imports ${name} from one file, in every call surface's first load`, () => {
      const sites = importersOf(part)
      expect(sites, `the files that import() ${name}`).toEqual([EFFECTS_HOST])
      const not = Object.keys(surfaces).filter((n) => !modules(surfaces[n].entries).has(sites[0]))
      expect(not, `${sites[0]} is not in the first load of`).toEqual([])
    })

    it(`every ${apart ? "signed-in surface, and every guest one," : "call surface"} has loaded the same part of ${name}`, () => {
      const of = modules([part], true)
      const kinds = apart ? [true, false].map((s) => Object.keys(surfaces).filter((n) => surfaces[n].signedIn === s)) : [Object.keys(surfaces)]
      expect(kinds.flatMap((names) => split(names, of))).toEqual([])
    })
  }

  // The camera's processor is built once for the green room's chunk and once for the call's runner: the chooser asks
  // it whether backgrounds can run through its surface (CallEffectsControl.unavailable), never with an import() of
  // its own, from a third set of loaded modules.
  it("imports the camera's processor only where the green room and the call put it on", () => {
    expect(importersOf("lib/calls/processors/background.ts")).toEqual([`${EFFECTS}/effectsRunner.tsx`, `${EFFECTS}/useGreenRoomEffects.ts`])
  })

  // The made part paints its scene with the chooser's drawing (ComposerProps.paint), never an import of its own: its
  // import() is made from the first load, where nothing has loaded the backdrops, so its chunk would carry a copy of
  // them (and their list of effects) beside the chooser's.
  it("the made part loads nothing of the chooser's own that no call surface loads first", () => {
    const first = Object.keys(surfaces)
      .map((n) => modules(surfaces[n].entries))
      .reduce((a, b) => new Set([...a].filter((m) => b.has(m))))
    const chooser = modules([`${EFFECTS}/EffectsChooser.tsx`])
    expect([...modules([`${EFFECTS}/madePart.tsx`], true)].filter((m) => chooser.has(m) && !first.has(m))).toEqual([])
  })

  // The picker's shared controls (its radio groups, the segmented control, the person icon) come
  // from the surface that draws the chooser (pickerControls.ts), never from the chooser's own chunk: a member's first
  // load has them, a guest's green room and call panel carry them. In the chooser's chunk they would join one more
  // chunk group to the modules the app's first load shares, and Turbopack would re-cut that first load into one
  // more chunk on every page (UX-CALLS-H4b size round, 12 Nov).
  it("the chooser loads none of the controls its surface hands it", () => {
    const handed = [`${EFFECTS}/pickerControls.ts`, "package @radix-ui/react-radio-group", "components/ui/segmentedControl.tsx", "icon User"]
    const chooser = modules([`${EFFECTS}/EffectsChooser.tsx`])
    expect(handed.filter((m) => chooser.has(m))).toEqual([])
    const surfaces = [`${EFFECTS}/GreenRoomEffects.tsx`, `${EFFECTS}/CallEffectsPanel.tsx`]
    expect(surfaces.filter((f) => !modules([f]).has(`${EFFECTS}/pickerControls.ts`)), "draws the chooser without handing it its controls").toEqual([])
  })
})
