import { afterEach, describe, expect, it, vi } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { act, cleanup, renderHook } from "@testing-library/react"
import type { Pins } from "@/lib/conversation/pins"

// A conversation's pins as a screen reads and changes them (chat B25): one
// read per conversation, a pin shown at once and put back with a toast when
// the server says no. useFetch is stood in for, so SWR never runs here.

const mutate = vi.fn()
let answer: { data: Pins } | undefined
let failed: unknown
const keys: string[] = []
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => {
    keys.push(key)
    return { data: key ? answer : undefined, isError: key ? failed : undefined, mutate }
  },
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me", user_name: "me" } } }),
}))
const toasts: unknown[] = []
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: (t: unknown) => toasts.push(t) }) }))
const setPinned = vi.fn()
vi.mock("@/lib/conversation/pins", async (actual) => ({ ...(await actual<typeof import("@/lib/conversation/pins")>()), setPinned: (...a: unknown[]) => setPinned(...a) }))

const { usePins } = await import("./usePins")

const channel = { kind: "channel", id: "c-1" } as const
const pinned = (id: string) => ({ message_id: id, pinned_by: { user_uuid: "maya" }, pinned_at: "2026-10-17T09:00:00Z", message: { id, html: "<p>x</p>" } })

afterEach(() => {
  cleanup()
  mutate.mockClear()
  setPinned.mockReset()
  toasts.length = 0
  keys.length = 0
  answer = undefined
  failed = undefined
})


pinTestClock()

describe("a conversation's pins", () => {
  it("are read at the conversation's key, and nothing is read for none", () => {
    renderHook(() => usePins(channel))
    renderHook(() => usePins(null))
    expect(keys).toContain("/conversations/channel/c-1/pins")
    expect(keys).toContain("")
  })

  it("say loading, then ready, or that they couldn't load", () => {
    const loading = renderHook(() => usePins(channel))
    expect(loading.result.current.status).toBe("loading")
    failed = new Error("down")
    const broken = renderHook(() => usePins(channel))
    expect(broken.result.current.status).toBe("error")
    answer = { data: { pins: [pinned("m-1")], can_pin: true, max: 100 } }
    const ready = renderHook(() => usePins(channel))
    expect(ready.result.current.status).toBe("ready")
    expect(ready.result.current.byMessage.get("m-1")?.message_id).toBe("m-1")
    expect(ready.result.current.canPin).toBe(true)
  })

  it("show a pin at once, then the server's answer", async () => {
    answer = { data: { pins: [], can_pin: true, max: 100 } }
    const next = { pins: [pinned("m-1")], can_pin: true, max: 100 }
    setPinned.mockResolvedValue(next)
    const { result } = renderHook(() => usePins(channel))
    await act(() => result.current.setPin("m-1", true))
    const shown = mutate.mock.calls[0][0] as { data: Pins }
    expect(shown.data.pins.map((p) => p.message_id)).toEqual(["m-1"])
    expect(shown.data.pins[0].pinned_by.user_uuid).toBe("me")
    expect(mutate.mock.calls[1][0]).toEqual({ data: next })
    expect(setPinned).toHaveBeenCalledWith(channel, "m-1", true)
  })

  it("put it back and say why when the server refuses", async () => {
    answer = { data: { pins: [pinned("m-1")], can_pin: true, max: 100 } }
    setPinned.mockRejectedValue({ response: { status: 403, data: { msg: "Only channel managers can pin messages in this channel." } } })
    const { result } = renderHook(() => usePins(channel))
    await act(() => result.current.setPin("m-1", false))
    expect((mutate.mock.calls[0][0] as { data: Pins }).data.pins).toEqual([])
    expect(mutate.mock.calls[1][0]).toBe(answer)
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({ title: "Couldn't unpin the message", variant: "destructive" })
  })
})
