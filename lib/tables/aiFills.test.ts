import { describe, expect, it, vi } from "vitest"
import { aiFillHeard, aiFillMessage, fillProgress, onAIFill } from "@/lib/tables/aiFills"
import { fillEnded } from "@/components/table/AIFillWatch"
import type { AIFill } from "@/services/tableService"

const fill = (over: Partial<AIFill> = {}): AIFill => ({ id: "f1", table_id: "t", field_id: "summary", total: 3200, asked: 340, filled: 338, state: "running", change_set: "cs1", ...over })

// TABLES-LEAD-26: a column's AI fill takes the whole column in background
// turns, and the table's topic says how far each one has got.
describe("a table's AI fills", () => {
  it("reads a fill from the table's topic, and nothing else", () => {
    expect(aiFillMessage({ action: "ai_fill", fill: fill() })).toEqual(fill())
    expect(aiFillMessage({ action: "updated", fill: fill() })).toBeNull()
    expect(aiFillMessage({ action: "ai_fill", fill: { id: "f1" } })).toBeNull()
    expect(aiFillMessage({ action: "ai_fill" })).toBeNull()
    expect(aiFillMessage(undefined)).toBeNull()
  })

  it("says how far a fill has got, never past its total", () => {
    expect(fillProgress(fill())).toBe("Filling 340 of 3,200")
    expect(fillProgress(fill({ asked: 3300 }))).toBe("Filling 3,200 of 3,200")
  })

  it("says what an ended fill wrote, skipped and left", () => {
    expect(fillEnded(fill({ state: "done", asked: 3200, filled: 3180 }))).toEqual({ title: "AI fill complete", description: "Filled 3,180 cells, skipped 20." })
    expect(fillEnded(fill({ state: "done", asked: 1, filled: 1, total: 1 }))).toEqual({ title: "AI fill complete", description: "Filled 1 cell." })
    expect(fillEnded(fill({ state: "stopped" }))).toEqual({ title: "AI fill stopped", description: "Filled 338 cells, skipped 2; 2,860 left unfilled." })
  })

  it("tells the listeners of the fill's own table alone, until they stop", () => {
    const mine = vi.fn()
    const other = vi.fn()
    const off = onAIFill("t", mine)
    onAIFill("u", other)
    aiFillHeard("t", fill())
    expect(mine).toHaveBeenCalledWith(fill())
    expect(other).not.toHaveBeenCalled()
    off()
    aiFillHeard("t", fill())
    expect(mine).toHaveBeenCalledTimes(1)
  })
})
