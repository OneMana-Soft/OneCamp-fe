import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"

const { post, toast, known } = vi.hoisted(() => ({ post: vi.fn(), toast: vi.fn(), known: { value: null as unknown } }))
vi.mock("@/lib/axiosInstance", () => ({ default: { post: (...a: unknown[]) => post(...a) }, OWN_ERRORS: {} }))
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a), useToast: () => ({ toast }) }))
vi.mock("@/lib/conversation/mentionables", () => ({ mentionablesOf: async () => known.value }))

const { namedIn, notToldWords } = await import("@/lib/conversation/notToldPrompt")
const { useNotToldPrompt } = await import("./useNotToldPrompt")
const JONAS = "1a000000-0000-4000-8000-000000000002"
const MAYA = "1a000000-0000-4000-8000-000000000001"
const chip = (id: string, name: string) => `<span data-type="mention" data-id="${id}@0x2" data-label="${name}">@${name}</span>`

beforeEach(() => {
  post.mockReset()
  toast.mockReset()
})

// MC-83, D-M9: a mention of someone who isn't in the channel says they weren't
// told, with Add them; nothing when everyone named is in it, or the list can't say.
describe("who wasn't told", () => {
  it("reads the people a message names, each once, never a room's or a team's chip", () => {
    expect(namedIn(`<p>${chip(JONAS, "Jonas")} ${chip(JONAS, "Jonas")} <span data-id="broadcast:here">@here</span></p>`)).toEqual([{ uuid: JONAS, name: "Jonas" }])
  })

  it("says it as D-M9 does", () => {
    expect(notToldWords(["Jonas"], "launch-pricing")).toBe("Jonas isn't in #launch-pricing, so they weren't told.")
    expect(notToldWords(["Jonas", "Ada", "Sam"], "x")).toBe("Jonas, Ada and Sam aren't in #x, so they weren't told.")
  })

  it("says who wasn't told and adds them when asked", async () => {
    known.value = { members: [MAYA], count: 1 }
    const { result } = renderHook(() => useNotToldPrompt())
    await act(() => result.current("c-1", "launch", `<p>${chip(MAYA, "Maya")} ${chip(JONAS, "Jonas")}</p>`))
    const shown = toast.mock.calls[0][0] as { title: string; action: { props: { onClick: () => void } } }
    expect(shown.title).toBe("Jonas isn't in #launch, so they weren't told.")
    post.mockResolvedValue({})
    await act(async () => shown.action.props.onClick())
    expect(post).toHaveBeenCalledWith("/ch/addMember", { channel_id: "c-1", user_id: JONAS }, {})
  })

  it("says nothing when everyone named is in it, or the list can't say", async () => {
    const { result } = renderHook(() => useNotToldPrompt())
    known.value = { members: [MAYA, JONAS], count: 2 }
    await act(() => result.current("c-1", "launch", `<p>${chip(JONAS, "Jonas")}</p>`))
    known.value = { members: [MAYA], count: 5000 }
    await act(() => result.current("c-1", "launch", `<p>${chip(JONAS, "Jonas")}</p>`))
    known.value = null
    await act(() => result.current("c-1", "launch", `<p>${chip(JONAS, "Jonas")}</p>`))
    expect(toast).not.toHaveBeenCalled()
  })
})
