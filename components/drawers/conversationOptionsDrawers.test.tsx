import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

// A phone's DM and group sheets changed the notification level with copies of
// their own: they showed nothing until the server answered, and a refusal was
// an unhandled rejection. They go through the one write the headers use
// (hooks/useConversationNotification).

const { makeRequest } = vi.hoisted(() => ({ makeRequest: vi.fn<(req: unknown) => Promise<unknown>>(async () => ({})) }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))
vi.mock("@/hooks/useFetch", () => ({
  useFetchOnlyOnce: (url: string) =>
    url.includes("Participants")
      ? { data: { data: { dm_grouping_id: "g1", dm_notification_type: "all", dm_participants: [] } }, isLoading: false }
      : { data: { data: { user_uuid: "u2", user_full_name: "Maya Chen", notification_type: "all" } }, isLoading: false },
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: true, isDesktop: false, isTablet: false }) }))
vi.mock("@/hooks/useWorkspaceName", () => ({ WorkspaceName: () => "Acme" }))
vi.mock("@/components/common/withFeature", () => ({ FeatureGate: ({ children }: { children: React.ReactNode }) => children }))

const { default: store } = await import("@/store/store")
const { ChatOptionsDrawer } = await import("./chatOptionsDrawer")
const { GroupChatOptionsDrawer } = await import("./groupChatOptionsDrawer")

const notifications = () => screen.getByRole("button", { name: /Notifications/ })

afterEach(() => {
  cleanup()
  makeRequest.mockReset()
  makeRequest.mockImplementation(async () => ({}))
})

describe.each([
  ["a DM's", () => <ChatOptionsDrawer drawerOpenState setOpenState={() => {}} chatId="u2" />, { to_user_id: "u2", notification_type: "mention" }],
  ["a group's", () => <GroupChatOptionsDrawer drawerOpenState setOpenState={() => {}} grpId="g1" />, { grp_id: "g1", notification_type: "mention" }],
])("%s phone sheet", (_, sheet, payload) => {
  it("moves to the next level at once, and sends it", () => {
    makeRequest.mockImplementation(() => new Promise(() => {}))
    render(<Provider store={store}>{sheet()}</Provider>)
    expect(notifications().textContent).toContain("All messages")
    act(() => {
      fireEvent.click(notifications())
    })
    expect(notifications().textContent).toContain("Mentions only")
    expect(makeRequest).toHaveBeenCalledWith(expect.objectContaining({ payload, showErrorToast: true }))
  })

  it("puts a refused change back, with nothing left unhandled", async () => {
    makeRequest.mockRejectedValue(new Error("Request failed with status code 500"))
    render(<Provider store={store}>{sheet()}</Provider>)
    await act(async () => {
      fireEvent.click(notifications())
    })
    expect(notifications().textContent).toContain("All messages")
  })
})
