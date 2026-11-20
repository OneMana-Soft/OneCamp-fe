import { describe, expect, it } from "vitest"
import { dynamicImportRe, reach, sourceOf } from "../../scripts/fluidity/reach.mjs"

// V-1049 (14 Nov 2026). The live cells (gridCells) are a chunk the grid
// (DataTableGrid) loads, and the grid draws under many pages: the table's own
// and every page whose editor embeds a table. Turbopack cuts the live cells'
// chunk once for each of those parents, and a loader (an import() site) in it
// lists the chunks its target needs beyond what that parent already holds, so
// its bytes differ from parent to parent. With the pickers' loader inside, a
// small change to one cell's code re-paired the cut differently under each
// parent, and 27 KB of cells shared by eight parents was copied into seven
// chunks (+66 KB gzipped, V-1034's chip). The loaders the live cells use live
// with the grid (cellLoaders), so their chunk holds the same bytes under every
// parent and is cut the same way under all of them.
describe("the live cells' chunk", () => {
  it("holds no loader: every import() the live cells reach lives with the grid", () => {
    const grid = reach("components/table/DataTableGrid.tsx")
    const loaders = [...reach("components/table/gridCells.tsx").keys()]
      .filter((file) => !grid.has(file))
      .flatMap((file) => {
        const src = sourceOf(file)
        return [...src.matchAll(dynamicImportRe)]
          .filter((m) => !/\btypeof\s*$/.test(src.slice(0, m.index)))
          .map((m) => `${file} -> ${m[1]}`)
      })
    expect(loaders).toEqual([])
  })
})
