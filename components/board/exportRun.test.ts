import { beforeEach, describe, expect, it, vi } from "vitest"

// An export the admin log can't record isn't made (V-363): runBoardExport (./exportRun, what the Export dialog and Ctrl
// or Cmd+S both run) tells the log first and makes the file only once the log has it, as a doc's export does.
const post = vi.fn()
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: (...a: unknown[]) => post(...a) } }))
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }))

import { EXPORT_NOT_RECORDED } from "@/lib/export/exportTell"
import { EXPORT_FAILED, EXPORT_REFUSED_TITLE } from "./exportRecord"
import { runBoardExport } from "./exportRun"

const BOARD = "b0a4d000-0000-4000-8000-0000000000f5"
const told = () => post.mock.calls.map((c) => c[1] as { board_uuid: string; format: string })

beforeEach(() => {
  post.mockReset().mockResolvedValue({ data: {} })
})

const TOO_MANY = "You've exported a lot in the last few minutes. Wait a few minutes and try again."

describe("runBoardExport", () => {
  it("makes the file only once the log has the export's tell, then says what was made", async () => {
    let answer: (v: unknown) => void = () => {}
    post.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    const toast = vi.fn()
    const make = vi.fn().mockResolvedValue("Saved as Launch plan.csv")
    const run = runBoardExport({ format: "csv", make, boardId: BOARD, toast })
    // Told, and nothing made or said while the log answers.
    await new Promise((r) => setTimeout(r, 0))
    expect(told()).toEqual([{ board_uuid: BOARD, format: "csv" }])
    expect(make).not.toHaveBeenCalled()
    answer({ data: {} })
    expect(await run).toBe(true)
    expect(make).toHaveBeenCalledTimes(1)
    expect(toast.mock.calls).toEqual([[{ title: "Saved as Launch plan.csv" }]])
  })

  it("makes no file the log refused, and says why in the server's words or that it couldn't be recorded", async () => {
    for (const [refusal, words] of [
      [{ response: { status: 429, data: { msg: TOO_MANY } } }, TOO_MANY],
      [new Error("Network Error"), EXPORT_NOT_RECORDED],
      [{ response: { status: 503, data: { msg: "Couldn't record the export. Try again." } } }, EXPORT_NOT_RECORDED],
    ] as const) {
      post.mockRejectedValueOnce(refusal)
      const toast = vi.fn()
      const make = vi.fn().mockResolvedValue("Saved")
      const made = vi.fn()
      expect(await runBoardExport({ format: "file", make, boardId: BOARD, toast, made })).toBe(false)
      expect(make).not.toHaveBeenCalled()
      expect(made).not.toHaveBeenCalled()
      expect(toast.mock.calls).toEqual([[{ variant: "destructive", title: EXPORT_REFUSED_TITLE, description: words }]])
    }
  })

  it("says a file that fails once told failed, and leaves its tell, over-telling rather than under-telling", async () => {
    const toast = vi.fn()
    const made = vi.fn()
    const ok = await runBoardExport({ format: "pdf", make: () => Promise.reject(new Error("a picture couldn't be read")), boardId: BOARD, toast, made })
    expect(ok).toBe(false)
    expect(told()).toEqual([{ board_uuid: BOARD, format: "pdf" }])
    expect(made).not.toHaveBeenCalled()
    expect(toast.mock.calls).toEqual([[{ variant: "destructive", ...EXPORT_FAILED }]])
  })

  it("tells nothing for a picture, which its own dialog's PNG or SVG tells", async () => {
    const make = vi.fn().mockResolvedValue(null)
    expect(await runBoardExport({ format: "picture", make, boardId: BOARD, toast: vi.fn() })).toBe(true)
    expect(make).toHaveBeenCalledTimes(1)
    expect(told()).toEqual([])
  })
})
