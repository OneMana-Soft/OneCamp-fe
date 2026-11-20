import { execFileSync } from "node:child_process"
import { describe, expect, it } from "vitest"
import { sourceFiles } from "@/lib/testing/sourceFiles"
import { dynamicImportRe, importRe, packageOf, reach, resolve, routeReach, sourceOf } from "../../scripts/fluidity/reach.mjs"

// V-1083 (16 Nov 2026). The board's drawing (boardExcalidraw) is a chunk the
// canvas loads, and the canvas draws under many parents: the board page, a
// call's stage, and the guest viewer under guest/b, its embed, a doc's board
// and a guest's call. Turbopack cuts the drawing's chunk once for each of
// them (13 ways), and the code block's (boardCodeBlock) under those (6 ways).
// A loader (an import() site) in such a chunk lists the chunks its target
// needs beyond what that parent already holds, so its bytes differ from
// parent to parent; a head that only added an import elsewhere re-paired the
// cuts by size, and 135 modules were copied into them (miro-33). The loaders
// the board's pieces use live with the canvas (boardLoaders), as the live
// cells' live with the grid (liveCellsChunk.test.ts), so each piece's chunk
// holds the same bytes under every parent and is cut the same way under all.
// The cost: a loader's own stub (170 B for the code block's) now sits in every
// group that holds a canvas (13 copies to 22), while 69 modules leave the
// drawing's cuts (V-1083's measure: about 8 KB gzipped less across the build).
// A loader whose target imports nothing (the highlighter's grammars) lists the
// same one chunk under every parent, so its bytes never differ: it may stay.

// The one loader kept in the drawing: Ctrl+S's export (exportRecord). With the canvas, its group is cut once per
// canvas parent (8 lazy cuts, about +40 KB gzipped across the build, V-1083's measure), more than its loader costs here.
const KEPT = ["components/board/exportRecord.ts -> @/components/board/exportRun"]

const CANVASES = ["components/board/boardCanvas.tsx", "components/guest/GuestBoardViewer.tsx"]
const PIECES = ["components/board/boardExcalidraw.tsx", "components/board/boardCodeBlock.tsx"]

/** Each package import's file, as Node's ESM resolver finds it (the build bundles the "import" condition). */
function packageFiles(specs: string[]): Map<string, string> {
  if (!specs.length) return new Map()
  const script = "for (const s of JSON.parse(process.argv[1])) console.log(new URL(import.meta.resolve(s)).pathname)"
  const files = execFileSync(process.execPath, ["--input-type=module", "-e", script, JSON.stringify(specs)], { encoding: "utf8" })
  return new Map(files.trim().split("\n").map((file, i) => [specs[i], file]))
}

/** Whether a source imports nothing: no import, export-from, import() or require. */
const importsNothing = (src: string) =>
  [...src.matchAll(importRe)].length === 0 && [...src.matchAll(dynamicImportRe)].length === 0 && !/\brequire\s*\(/.test(src)

/** The files whose import() sites name `target`. */
function loadersOf(target: string): string[] {
  return sourceFiles(["app", "components", "hooks", "lib"], /\.tsx?$/).filter((file) =>
    [...sourceOf(file).matchAll(dynamicImportRe)].some((m) => resolve(m[1], file) === target),
  )
}

describe("the board's pieces' chunks", () => {
  const canvases = CANVASES.map((canvas) => reach(canvas))
  const withEveryCanvas = (file: string) => canvases.every((canvas) => canvas.has(file))

  it("hold no loader: every import() the drawing and the code block reach lives with the canvas", () => {
    const sites = PIECES.flatMap((piece) => [...reach(piece).keys()])
      .filter((file, i, all) => all.indexOf(file) === i && !withEveryCanvas(file))
      .flatMap((file) => {
        const src = sourceOf(file)
        return [...src.matchAll(dynamicImportRe)]
          .filter((m) => !/\btypeof\s*$/.test(src.slice(0, m.index)))
          .map((m) => ({ file, spec: m[1] }))
      })
    const packages = packageFiles([...new Set(sites.filter((s) => packageOf(s.spec)).map((s) => s.spec))])
    const target = ({ file, spec }: { file: string; spec: string }) => (packageOf(spec) ? packages.get(spec) : resolve(spec, file))
    const loaders = sites.filter((site) => {
      const file = target(site)
      return !file || !importsNothing(sourceOf(file))
    })
    const named = loaders.map(({ file, spec }) => `${file} -> ${spec}`)
    expect(named.filter((site) => !KEPT.includes(site))).toEqual([])
    expect(KEPT.filter((site) => !named.includes(site)), "a kept loader that is gone leaves KEPT").toEqual([])
  })

  it("load only under a canvas, so every parent holds their loaders", () => {
    const outside = PIECES.flatMap((piece) => loadersOf(piece).filter((file) => !withEveryCanvas(file) && !CANVASES.includes(file)))
    expect(outside).toEqual([])
  })

  // V-1167 (18 Nov 2026). A lazy chunk's group is what its target reaches beyond what the parent already holds, so
  // the drawing is cut the same way under every parent only when every parent holds the same part of it. At BASE the
  // board page held lib/board/ids.ts, the call stage did not hold viewport.ts and a guest's viewer did not hold
  // excalidrawPart.ts: 10 drawing variants with 6 module sets, and every board library in the drawing (layers.ts,
  // mindMapTree.ts, cards.ts...) shipped once per set. The rule: no parent holds any of the drawing that both canvases
  // don't (drawingShared), so each parent holds exactly that part. What a parent may hold is walked from every page
  // that leads to a canvas: its route's static reach, then each import() target on the way to a canvas, until one
  // holds a canvas. Packages are not walked (reach): what excalidraw's own imports share with a parent is outside
  // this rule (V-1167's size table).
  it("are cut once: what any parent holds of the drawing, both canvases hold", () => {
    const both = new Set([...canvases[0].keys()].filter((file) => canvases[1].has(file)))
    const shared = new Set([...reach(PIECES[0]).keys()].filter((file) => !both.has(file) && file !== PIECES[0]))
    const toCanvas = leadsToCanvas()
    const held = new Set<string>()
    const seen = new Set<string>()
    const holds = (files: Iterable<string>, by: string) => {
      const set = new Set(files)
      for (const file of set) if (shared.has(file)) held.add(`${file} held by ${by}`)
      if (CANVASES.some((canvas) => set.has(canvas))) return []
      return [...set].flatMap(lazyTargets).filter((target) => toCanvas.has(target) && !seen.has(target) && !!seen.add(target))
    }
    const queue = sourceFiles(["app"], /\/page\.tsx?$/)
      .filter((page) => toCanvas.has(page))
      .flatMap((page) => holds(routeReach(page).keys(), page))
    while (queue.length) {
      const target = queue.shift()!
      queue.push(...holds(reach(target).keys(), target))
    }
    expect([...held]).toEqual([])
  })
})

/** The literal import() targets of a file (a `typeof import()` is a type). */
function lazyTargets(file: string): string[] {
  const src = sourceOf(file)
  return [...src.matchAll(dynamicImportRe)]
    .filter((m) => !/\btypeof\s*$/.test(src.slice(0, m.index)))
    .map((m) => resolve(m[1], file))
    .filter((target): target is string => !!target)
}

/** Every source file from which a canvas is reached, by static imports and import() alike. */
function leadsToCanvas(): Set<string> {
  const importers = new Map<string, string[]>()
  for (const file of sourceFiles(["app", "components", "hooks", "lib"], /\.tsx?$/)) {
    const src = sourceOf(file)
    const specs = [...src.matchAll(importRe), ...src.matchAll(dynamicImportRe)].map((m) => resolve(m[1], file))
    for (const target of specs) if (target) importers.set(target, [...(importers.get(target) ?? []), file])
  }
  const seen = new Set<string>(CANVASES)
  const queue = [...CANVASES]
  while (queue.length) for (const from of importers.get(queue.shift()!) ?? []) if (!seen.has(from)) seen.add(from), queue.push(from)
  return seen
}
