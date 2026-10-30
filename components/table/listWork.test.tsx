import { renders } from "@/lib/testing/reactRenders"
import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { countReads, scrollBox, sizeBoxes } from "@/lib/testing/virtualBox"
import { FLUIDITY_FIELDS, fluidityRows } from "@/lib/testing/fluidityTable"

// The phone's row list at scale (tables T5c; FLUIDITY-LEAD-3's run of 21 Oct
// 2026): a scroll of the 100,000-row table on a phone at 4× dropped 16% of
// its frames and rendered about 23,000 components, as the grid did before
// its own fixes (gridWork.test.tsx, gridRowRenders.test.tsx). What a scroll
// tick costs the list, counted in the rows it reads and parses and the
// components it renders, so a regression fails here before a run times it.

const parsed = vi.fn()
vi.mock("@/services/tableService", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/services/tableService")>()
  return {
    ...real,
    // Counted: every read of a row's values is a JSON parse.
    parseRowValues: (r: Parameters<typeof real.parseRowValues>[0]) => {
      parsed(r.id)
      return real.parseRowValues(r)
    },
  }
})

const { TableRowList } = await import("@/components/table/TableRowList")

// A phone's screen of room for the list's scroll box.
const unsized = sizeBoxes("data-list-scroll", { width: 390, height: 720 })
afterAll(unsized)
afterEach(() => {
  cleanup()
  parsed.mockReset()
})

const box = () => document.querySelector<HTMLElement>("[data-list-scroll]")!
/** The place of the first row drawn. */
const first = () => Number(document.querySelector("li[aria-posinset]")?.getAttribute("aria-posinset")) - 1

describe("a scroll of the phone's list", () => {
  // Its key function was a new one each render, so the virtualizer worked
  // out every row's place again each tick, and every row in the window was
  // drawn again, its values parsed again.
  it("reads and parses the rows entering its window, not every row of the table", () => {
    const { items: rows, reads } = countReads(fluidityRows(10_000))
    render(<TableRowList fields={FLUIDITY_FIELDS} edits={new Map()} rows={rows} onOpen={() => {}} />)
    scrollBox(box(), 40_000)
    const at = first()
    expect(at).toBeGreaterThan(500)
    reads.n = 0
    parsed.mockClear()
    for (const top of [40_400, 40_800, 41_200, 41_600]) scrollBox(box(), top)
    // The window moved down with each tick (6 or 7 rows a tick).
    const entered = first() - at
    expect(entered).toBeGreaterThan(20)
    // About one window of rows (28) a tick.
    expect(reads.n).toBeLessThan(200)
    // Each row parsed as it enters, once; the rows drawn already, never.
    expect(parsed.mock.calls.length).toBeLessThanOrEqual(entered + 2)
  })

  // Every row in the window rendered again each tick, with its chips and
  // icons, and the list's own add button with them.
  it("renders a row entering once, and the window once a tick", () => {
    render(<TableRowList fields={FLUIDITY_FIELDS} edits={new Map()} rows={fluidityRows(10_000)} onOpen={() => {}} onAdd={() => {}} />)
    scrollBox(box(), 40_000)
    const at = first()
    renders.reset()
    const ticks = 5
    for (let k = 1; k <= ticks; k++) scrollBox(box(), 40_000 + k * 400)
    const entered = first() - at
    expect(entered).toBeGreaterThanOrEqual(30)
    expect(renders.count, `${renders.count} renders for ${entered} rows: ${renders.top()}`).toBeLessThanOrEqual(entered + ticks)
  })
})
