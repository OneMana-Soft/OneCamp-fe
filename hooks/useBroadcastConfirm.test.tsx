import { beforeEach, describe, expect, it, vi } from "vitest"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { renderHook, act } from "@testing-library/react"

const { get, dispatch } = vi.hoisted(() => ({ get: vi.fn(), dispatch: vi.fn() }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get: (...a: unknown[]) => get(...a) } }))
vi.mock("react-redux", () => ({ useDispatch: () => dispatch }))
// What the app's confirm was asked: the opened confirm's options.
const confirm = { get calls() { return dispatch.mock.calls.map((c) => c[0].payload.data) } }

const { broadcastsIn, broadcastQuestion } = await import("@/lib/conversation/broadcastConfirm")
const { useBroadcastConfirm } = await import("./useBroadcastConfirm")
const chip = (id: string) => `<span data-type="mention" data-id="broadcast:${id}">@${id}</span>`

beforeEach(() => {
  get.mockReset()
  dispatch.mockReset()
})

// D-T12: a broadcast to a channel of six or more asks first, naming how many
// it notifies; a smaller channel, no broadcast, or a refused one is sent as it is.
describe("asking before a broadcast", () => {
  it("reads each broadcast once, and never a person's chip", () => {
    expect(broadcastsIn(`<p>${chip("here")}${chip("channel")}${chip("here")}<span data-id="u@0x1"></span></p>`)).toEqual(["here", "channel"])
    expect(broadcastsIn("<p>@channel in words</p>")).toEqual([])
  })

  it("names the count and the channel", () => {
    expect(broadcastQuestion(["channel"], 41, "launch")).toEqual({
      title: "Notify 41 people?",
      description: "@channel tells everyone in #launch, each by their notification settings.",
    })
    expect(broadcastQuestion(["here"], 1, "").title).toBe("Notify 1 person?")
    expect(broadcastQuestion(["here"], 3, "").description).toContain("everyone here now in this channel")
  })

  it("asks from the channel's size, and sends only when the person says so", async () => {
    get.mockResolvedValue({ data: { data: { may: true, members: 42, confirm_at: 6, reach: { channel: 41 } } } })
    const send = vi.fn()
    const { result } = renderHook(() => useBroadcastConfirm())
    await act(() => result.current("c-1", "launch", `<p>${chip("channel")} ship</p>`, send))
    expect(get).toHaveBeenCalledWith("/conversations/channel/c-1/broadcasts?reach=channel", OWN_ERRORS)
    expect(send).not.toHaveBeenCalled()
    expect(confirm.calls).toEqual([expect.objectContaining({ title: "Notify 41 people?", confirmText: "Send" })])
    confirm.calls[0].onConfirm()
    expect(send).toHaveBeenCalledTimes(1)
  })

  it("sends at once with no broadcast, in a small channel, when refused, or when the rules can't be read", async () => {
    const send = vi.fn()
    const { result } = renderHook(() => useBroadcastConfirm())
    await act(() => result.current("c-1", "launch", "<p>hello</p>", send))
    get.mockResolvedValueOnce({ data: { data: { may: true, members: 4, confirm_at: 6 } } })
    await act(() => result.current("c-1", "launch", `<p>${chip("here")}</p>`, send))
    get.mockResolvedValueOnce({ data: { data: { may: false, members: 40, confirm_at: 6 } } })
    await act(() => result.current("c-1", "launch", `<p>${chip("here")}</p>`, send))
    get.mockRejectedValueOnce(new Error("503"))
    await act(() => result.current("c-1", "launch", `<p>${chip("here")}</p>`, send))
    expect(send).toHaveBeenCalledTimes(4)
    expect(confirm.calls).toEqual([])
  })
})
