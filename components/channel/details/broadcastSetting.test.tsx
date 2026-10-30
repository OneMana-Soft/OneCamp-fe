import { beforeEach, describe, expect, it, vi } from "vitest"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

const { put, toast, rules } = vi.hoisted(() => ({ put: vi.fn(), toast: vi.fn(), rules: { value: {} as Record<string, unknown> } }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { put: (...a: unknown[]) => put(...a) } }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: { data: rules.value }, mutate: async () => undefined }) }))

const { BroadcastSetting } = await import("./broadcastSetting")

beforeEach(() => {
  cleanup()
  put.mockReset()
  toast.mockReset()
})

// TN-51: a channel's managers choose whether its members notify all of it.
describe("Allow @here and @channel", () => {
  it("isn't shown to someone who can't change it", () => {
    rules.value = { members_may: true, own: false, manages: false }
    render(<BroadcastSetting channelId="c-1" />)
    expect(screen.queryByRole("switch")).toBeNull()
  })

  it("lets a manager turn it off, and give it back to the workspace's", async () => {
    rules.value = { members_may: true, own: false, manages: true }
    put.mockResolvedValue({})
    const { rerender } = render(<BroadcastSetting channelId="c-1" />)
    await act(async () => fireEvent.click(screen.getByRole("switch", { name: "Allow @here and @channel" })))
    expect(put).toHaveBeenCalledWith("/conversations/channel/c-1/broadcasts", { members: false }, OWN_ERRORS)
    rules.value = { members_may: false, own: true, manages: true }
    rerender(<BroadcastSetting channelId="c-1" />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Use the workspace's" })))
    expect(put).toHaveBeenLastCalledWith("/conversations/channel/c-1/broadcasts", { members: null }, OWN_ERRORS)
  })
})
