import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import type { ChannelInfoInterface } from "@/types/channel"

// A channel's notification level was changed by four copies of one write: the
// header's More menu, Details, and a phone's two channel sheets. Only two said
// a refusal in the channel's words or showed the sidebar's row muted once it
// was saved, and the phone's left a refused change as an unhandled rejection.
// useChannelNotification is the one write, over lib/optimistic.

const { makeRequest } = vi.hoisted(() => ({ makeRequest: vi.fn<(req: unknown) => Promise<unknown>>(async () => ({})) }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))

const { default: userSlice } = await import("@/store/slice/userSlice")
const { useChannelNotification } = await import("./useConversationNotification")

function storeWith(...ids: string[]) {
  const store = configureStore({ reducer: { users: userSlice.reducer } })
  const rows = ids.map((id) => ({ ch_uuid: id, ch_name: id, notification_type: "all" }) as ChannelInfoInterface)
  store.dispatch({ type: "users/createUserChannelList", payload: { channelsUser: rows, favChannelsUser: [] } })
  return store
}
const sidebarLevel = (store: ReturnType<typeof storeWith>, id: string) => store.getState().users.userSidebar.userChannels.find((c) => c?.ch_uuid === id)?.notification_type

let choose: (next: string) => void = () => {}
function Level({ channelId, saved }: { channelId: string; saved?: string }) {
  const n = useChannelNotification(channelId, saved, channelId)
  choose = n.choose
  return <p>{n.level}</p>
}

afterEach(() => {
  cleanup()
  makeRequest.mockReset()
  makeRequest.mockImplementation(async () => ({}))
})

describe("a channel's notification level", () => {
  it("shows a choice at once, saves it in the channel's words, and the sidebar's row follows once saved", async () => {
    const store = storeWith("launch")
    let answer: (v: unknown) => void = () => {}
    makeRequest.mockImplementation(() => new Promise((r) => (answer = r)))
    render(<Provider store={store}><Level channelId="launch" saved="all" /></Provider>)
    act(() => choose("block"))
    expect(screen.getByText("block")).toBeTruthy()
    expect(sidebarLevel(store, "launch")).toBe("all")
    expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({
      payload: { channel_id: "launch", notification_type: "block" },
      showErrorToast: true,
      failureTitle: "Couldn't change your notifications for #launch",
    }))
    await act(async () => answer({}))
    expect(sidebarLevel(store, "launch")).toBe("block")
  })

  it("takes a refused choice back and leaves the sidebar as it was, with nothing unhandled", async () => {
    const store = storeWith("launch")
    makeRequest.mockRejectedValue(new Error("Request failed with status code 500"))
    render(<Provider store={store}><Level channelId="launch" saved="all" /></Provider>)
    await act(async () => choose("mention"))
    expect(screen.getByText("all")).toBeTruthy()
    expect(sidebarLevel(store, "launch")).toBe("all")
  })

  it("reads the next channel's own level, even one the last channel was given too", () => {
    const store = storeWith("launch", "design")
    const { rerender } = render(<Provider store={store}><Level channelId="launch" saved="all" /></Provider>)
    act(() => choose("block"))
    expect(screen.getByText("block")).toBeTruthy()
    rerender(<Provider store={store}><Level channelId="design" saved="all" /></Provider>)
    expect(screen.getByText("all")).toBeTruthy()
  })
})
