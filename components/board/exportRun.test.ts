import { beforeEach, describe, expect, it, vi } from "vitest"

// The admin log is a hash chain that is never rewritten, so an export it is told of stays there for good: runBoardExport
// (./exportRun, what the Export dialog and Ctrl or Cmd+S both run) tells one only once its file is made, never a failed one.
const post = vi.fn()
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: (...a: unknown[]) => post(...a) } }))
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }))

import { EXPORT_FAILED } from "./exportRecord"
import { runBoardExport } from "./exportRun"

const BOARD = "b0a4d000-0000-4000-8000-0000000000f5"
const told = () => post.mock.calls.map((c) => c[1] as { board_uuid: string; format: string })

beforeEach(() => {
  post.mockReset().mockResolvedValue({ data: {} })
})

describe("runBoardExport", () => {
  it("never tells an export whose file wasn't made, and says it failed", async () => {
    const toast = vi.fn()
    const made = vi.fn()
    const ok = await runBoardExport({ format: "pdf", make: () => Promise.reject(new Error("a picture couldn't be read")), boardId: BOARD, toast, made })
    expect(ok).toBe(false)
    expect(told()).toEqual([])
    expect(made).not.toHaveBeenCalled()
    expect(toast.mock.calls).toEqual([[{ variant: "destructive", ...EXPORT_FAILED }]])
  })

  it("tells an export only once its file is made, then says what was made", async () => {
    let finish: (said: string) => void = () => {}
    const toast = vi.fn()
    const run = runBoardExport({ format: "csv", make: () => new Promise<string>((resolve) => (finish = resolve)), boardId: BOARD, toast })
    // Its file is still being made: nothing is told or said yet.
    await new Promise((r) => setTimeout(r, 0))
    expect(told()).toEqual([])
    expect(toast).not.toHaveBeenCalled()
    finish("Saved as Launch plan.csv")
    expect(await run).toBe(true)
    expect(told()).toEqual([{ board_uuid: BOARD, format: "csv" }])
    expect(toast.mock.calls).toEqual([[{ title: "Saved as Launch plan.csv" }]])
  })
})
