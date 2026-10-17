import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { PostEndpointUrl } from "@/services/endPoints"

const h = vi.hoisted(() => ({ makeRequest: vi.fn() }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: h.makeRequest, isSubmitting: false }) }))

const { useProjectNotification } = await import("./useNotificationLevel")

afterEach(() => {
  cleanup()
  h.makeRequest.mockReset()
})

/**
 * A project's notification level, on a computer's header and in a phone's
 * menu: what the project's answer says, a choice shown at once, and a refused
 * choice taken back.
 */
describe("a project's notification level", () => {
  it("follows the project's answer, also when the answer changes", () => {
    const { result, rerender } = renderHook(({ saved }) => useProjectNotification("p1", saved), { initialProps: { saved: undefined as string | undefined } })
    expect(result.current.level).toBe("all")
    rerender({ saved: "mention" })
    expect(result.current.level).toBe("mention")
    // Changed elsewhere (a phone), and read again here: the header said the old level.
    rerender({ saved: "block" })
    expect(result.current.level).toBe("block")
  })

  it("shows a choice at once and sends it", async () => {
    h.makeRequest.mockResolvedValue({})
    const { result } = renderHook(() => useProjectNotification("p1", "all"))
    await act(async () => result.current.choose("mention"))
    expect(result.current.level).toBe("mention")
    expect(h.makeRequest).toHaveBeenCalledWith({ payload: { project_id: "p1", notification_type: "mention" }, apiEndpoint: PostEndpointUrl.UpdateProjectNotification })
  })

  it("takes a refused choice back", async () => {
    h.makeRequest.mockRejectedValue(new Error("refused"))
    const { result } = renderHook(() => useProjectNotification("p1", "mention"))
    await act(async () => result.current.choose("block"))
    expect(result.current.level).toBe("mention")
  })
})
