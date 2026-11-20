import { lazyView } from "@/lib/lazy/lazyView"

// The live cells' loaders: with the grid, out of the cells' own chunk (V-1049, liveCellsChunk.test.ts).
export const cellPickers = lazyView(() => import("@/components/table/cellPickers"))
export const kindCells = lazyView(() => import("@/components/table/kindCells"))
export const filesPart = lazyView(() => import("@/components/table/FilesCell"))
