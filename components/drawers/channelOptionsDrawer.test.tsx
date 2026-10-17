import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

// A phone's channel sheet changed the notification level with a copy of its
// own: it showed nothing until the server answered, a refusal raised an
// unhandled rejection, and the sidebar's row never heard of a change. It goes
// through the one write the header and Details use (hooks/useNotificationLevel).

const { makeRequest } = vi.hoisted(() => ({ makeRequest: vi.fn<(req: unknown) => Promise<unknown>>(async () => ({})) }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: { channel_info: { ch_uuid: "c1", ch_name: "launch", notification_type: "all", ch_is_user_fav: false } }, isLoading: false, mutate: () => {} }),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/hooks/useWorkspaceName", () => ({ WorkspaceName: () => "Acme" }))
vi.mock("@/components/common/withFeature", () => ({ FeatureGate: ({ children }: { children: React.ReactNode }) => children }))

const { default: store } = await import("@/store/store")
const { ChannelOptionsDrawer } = await import("./channelOptionsDrawer")

store.dispatch({ type: "users/createUserChannelList", payload: { channelsUser: [{ ch_uuid: "c1", ch_name: "launch", notification_type: "all" }], favChannelsUser: [] } })
const sidebarLevel = () => store.getState().users.userSidebar.userChannels.find((c) => c?.ch_uuid === "c1")?.notification_type

const sheet = () =>
  render(
    <Provider store={store}>
      <ChannelOptionsDrawer drawerOpenState setOpenState={() => {}} channelId="c1" />
    </Provider>,
  )
const notifications = () => screen.getByRole("button", { name: /Notifications/ })

afterEach(() => {
  cleanup()
  makeRequest.mockReset()
  makeRequest.mockImplementation(async () => ({}))
})

describe("a phone's channel sheet", () => {
  it("moves to the next level at once, in the channel's words, and the sidebar's row follows once it's saved", async () => {
    let answer: (v: unknown) => void = () => {}
    makeRequest.mockImplementation(() => new Promise((r) => (answer = r)))
    sheet()
    expect(notifications().textContent).toContain("All messages")
    act(() => {
      fireEvent.click(notifications())
    })
    expect(notifications().textContent).toContain("Mentions only")
    expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({ showErrorToast: true, failureTitle: "Couldn't change your notifications for #launch" }))
    await act(async () => answer({}))
    expect(sidebarLevel()).toBe("mention")
  })

  it("puts a refused change back, with nothing left unhandled", async () => {
    makeRequest.mockRejectedValue(new Error("Request failed with status code 500"))
    sheet()
    await act(async () => {
      fireEvent.click(notifications())
    })
    expect(notifications().textContent).toContain("All messages")
  })
})
