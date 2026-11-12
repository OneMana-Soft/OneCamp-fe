import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react"
import type { ScheduledMessage } from "@/hooks/useScheduledMessages"
import { formatSendAt } from "@/lib/messages/schedulePresets"
import { pinTestClock, TEST_TODAY } from "@/lib/testing/testClock"

// V-711, DESIGN-BUILD-125 F2 and F3. After Delete in Scheduled messages the
// box still said "Scheduled for tomorrow at 9:00 AM · Undo" for a message that
// was gone: the chip lived on its 6 s timer whatever happened to it. And one
// Delete raised two toasts, a generic "Done" and "Scheduled message deleted",
// printed over each other; Send now, Reschedule and scheduling did the same.

const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
let listed: ScheduledMessage[] = []
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: { data: listed }, isLoading: false }) }))
vi.mock("@/lib/swrMutate", () => ({ appMutate: vi.fn() }))
const post = vi.fn()
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get: vi.fn(), post: (...a: unknown[]) => post(...a) } }))

const { useScheduledMessages, useScheduleMessage } = await import("@/hooks/useScheduledMessages")
const { useUndoSchedule } = await import("./useUndoSchedule")
const { ScheduledChip, useSendLater } = await import("./composerTools")

const AT = new Date(2026, 9, 16, 9, 0)
const queued = (at: Date, id = "s1"): ScheduledMessage => ({ id, kind: "dm", target: "maya", send_at: at.toISOString(), status: "pending", preview: "The launch note is attached." })
const titles = () => toast.mock.calls.map(([t]) => (t as { title: string }).title)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  listed = []
})

type Actions = ReturnType<typeof useScheduledMessages>

describe("what is done to a scheduled message says so once, in its own words (F3)", () => {
  pinTestClock()
  it.each<[string, (h: Actions) => Promise<boolean>, () => string]>([
    ["Delete", (h) => h.cancel("s1"), () => "Scheduled message deleted"],
    ["Send now", (h) => h.sendNow("s1"), () => "Sent"],
    ["Reschedule", (h) => h.reschedule("s1", AT), () => `Rescheduled for ${formatSendAt(AT)}`],
  ])("%s: one toast", async (_, run, words) => {
    post.mockResolvedValueOnce({ data: { msg: "ok", data: null } })
    const { result } = renderHook(() => useScheduledMessages("maya"))
    let ok: boolean | undefined
    await act(async () => {
      ok = await run(result.current)
    })
    expect(ok).toBe(true)
    expect(titles()).toEqual([words()])
  })

  it("a refused one says why, once, and is not done", async () => {
    post.mockRejectedValueOnce({ response: { status: 400, data: { msg: "It has gone already." } } })
    const { result } = renderHook(() => useScheduledMessages("maya"))
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.cancel("s1")
    })
    expect(ok).toBe(false)
    expect(toast).toHaveBeenCalledTimes(1)
    expect(toast.mock.calls[0][0]).toMatchObject({ variant: "destructive" })
  })

  it("scheduling says when it will go, once", async () => {
    post.mockResolvedValueOnce({ data: { msg: "ok", data: queued(AT) } })
    const { result } = renderHook(() => useScheduleMessage())
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current("dm", { text: "The launch note is attached." }, AT)
    })
    expect(ok).toBe(true)
    expect(titles()).toEqual([`Scheduled for ${formatSendAt(AT)}`])
  })
})

describe("the scheduled chip leaves with its message (F2)", () => {
  pinTestClock()
  it("knows its message in the conversation's queue, and its Undo takes that one back", async () => {
    listed = [queued(new Date(AT.getTime() - 3_600_000), "s0"), queued(AT)]
    post.mockResolvedValue({ data: { msg: "ok", data: null } })
    const { result } = renderHook(() => useUndoSchedule("maya"))
    expect(result.current.queued(AT)).toBe(true)
    expect(result.current.queued(new Date(AT.getTime() + 3_600_000))).toBe(false)
    await act(async () => result.current.undo(AT))
    expect(post).toHaveBeenCalledWith(expect.stringContaining("cancel"), { id: "s1" }, expect.anything())
  })

  it("goes as soon as its message leaves the queue, not on its 6 s timer", () => {
    const onDone = vi.fn()
    const chip = (here: boolean) => <ScheduledChip at={AT} schedule={{ undo: vi.fn(), queued: () => here }} onDone={onDone} />
    // Not listed yet (the list is still on its way): it stays.
    const { rerender } = render(chip(false))
    expect(onDone).not.toHaveBeenCalled()
    rerender(chip(true))
    expect(onDone).not.toHaveBeenCalled()
    // Deleted in Scheduled messages, sent now, or sent: it goes.
    rerender(chip(false))
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})

// CR-B44 F1: the chip's 6 s are counted once. Its timer started again on
// every redraw of the box (useSendLater's done was a new function each time),
// so a box redrawn as one typed kept the chip for good.
describe("the scheduled chip's 6 s", () => {
  function Box({ typed }: { typed: string }) {
    const { scheduled, schedule, done } = useSendLater(async () => true)
    return (
      <div data-typed={typed}>
        <button type="button" onClick={() => void schedule?.(AT)}>Tomorrow morning</button>
        {scheduled && <ScheduledChip at={scheduled} onDone={done} />}
      </div>
    )
  }

  it("are counted from when it went, however often the box redraws", async () => {
    vi.useFakeTimers({ now: TEST_TODAY })
    try {
      const { rerender } = render(<Box typed="" />)
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Tomorrow morning" })))
      expect(screen.getByRole("status")).toHaveTextContent("Scheduled for")
      for (const typed of ["T", "Th", "The"]) {
        act(() => vi.advanceTimersByTime(1_900))
        rerender(<Box typed={typed} />)
      }
      expect(screen.getByRole("status")).toHaveTextContent("Scheduled for")
      act(() => vi.advanceTimersByTime(400))
      expect(screen.queryByRole("status")).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
