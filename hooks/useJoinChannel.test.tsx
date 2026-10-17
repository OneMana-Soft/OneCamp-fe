import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { PostEndpointUrl } from "@/services/endPoints"

// A channel's page, on a computer and a phone, awaited a join with no catch
// of its own: a refused join was an unhandled rejection under the toast. The
// join is one hook now, and a refusal is said once, in the channel's name and
// the server's words (usePost's own toast, through apiErrorMessage).

const { makeRequest } = vi.hoisted(() => ({ makeRequest: vi.fn<(req: { onSuccess?: () => void }) => Promise<unknown>>() }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))

const { useJoinChannel } = await import("@/hooks/useJoinChannel")

afterEach(() => {
  cleanup()
  makeRequest.mockReset()
})

describe("joining a channel from its page", () => {
  it("says a refusal in the channel's name, and leaves nothing unhandled", async () => {
    makeRequest.mockRejectedValue(Object.assign(new Error("Request failed with status code 403"), { response: { status: 403, data: { msg: "This channel is invitation only." } } }))
    const joined = vi.fn()
    const { result } = renderHook(() => useJoinChannel("c1", joined, "design-crit"))
    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.join()
    })
    expect(ok).toBe(false)
    expect(joined).not.toHaveBeenCalled()
    expect(makeRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        apiEndpoint: PostEndpointUrl.JoinChannel,
        payload: { channel_uuid: "c1" },
        showErrorToast: true,
        failureTitle: "Couldn't join #design-crit",
      }),
    )
  })

  it("reads the channel again once joined", async () => {
    makeRequest.mockImplementation(async (req) => {
      req.onSuccess?.()
      return {}
    })
    const joined = vi.fn()
    const { result } = renderHook(() => useJoinChannel("c1", joined, "design-crit"))
    await act(async () => {
      await result.current.join()
    })
    expect(joined).toHaveBeenCalledTimes(1)
  })
})
