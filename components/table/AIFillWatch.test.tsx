import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, waitFor } from "@testing-library/react"

import type { AIFill } from "@/services/tableService"

const running: AIFill = { id: "f1", table_id: "t", field_id: "summary", started_by: "me", total: 3200, asked: 1200, filled: 1190, state: "running" }
const stop = vi.fn()
const toast = vi.fn()
vi.mock("@/lib/tables/useAIFills", () => ({ useAIFills: () => new Map([["summary", running]]) }))
vi.mock("@/hooks/useMyId", () => ({ useMyId: () => "me" }))
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }))
vi.mock("@/services/tableService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableService")>()),
  stopTableAIFill: (...a: unknown[]) => stop(...a),
}))

import { AIFillWatch } from "@/components/table/AIFillWatch"

afterEach(() => {
  cleanup()
  stop.mockReset()
  toast.mockReset()
})

// TABLES-LEAD-27 (CR-32's SF2): a Stop that fails says so; the fill goes on.
describe("AIFillWatch", () => {
  it("marks the fill this person started, and says so when its Stop fails", async () => {
    const onFills = vi.fn()
    render(<AIFillWatch tableId="t" onFills={onFills} onEnded={vi.fn()} />)
    await waitFor(() => expect(onFills).toHaveBeenCalled())
    const fill = (onFills.mock.calls.at(-1)?.[0] as Map<string, AIFill>).get("summary")
    expect(fill?.mine).toBe(true)
    stop.mockRejectedValueOnce(new Error("offline"))
    fill?.stop?.()
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive", title: "Couldn't stop the fill" })))
    expect(stop).toHaveBeenCalledWith("t", "summary")
  })
})
