import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// On a phone, the check-in card's Answer did nothing, and it is the demo
// guide's first step (design review PG1-44). The row opens its thread on a
// tap that isn't on one of its own buttons, and Answer is a button: the click
// it passed on was left alone. Answer now opens the thread itself, and the
// row's rule is the row's (opensThread), once for every kind of conversation.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: true, isDesktop: false }) }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: undefined, isLoading: false, mutate: () => {} }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "sam" } } }),
}))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/hooks/useUserInfoState", () => ({ useUserInfoState: () => ({}) }))
const kinds: Record<string, string> = { checkin: "checkin" }
vi.mock("@/hooks/useBotKinds", () => ({
  useBotKind: (id?: string, isBot?: boolean) => (isBot && id ? kinds[id] : undefined),
  useBotKindMap: () => kinds,
}))
vi.mock("@/components/textInput/textInput", () => ({
  default: ({ content }: { content?: string }) => <div data-testid="body" dangerouslySetInnerHTML={{ __html: String(content) }} />,
}))
vi.mock("@/lib/utils/useInternalLinkRouter", () => ({ useInternalLinkRouter: () => undefined }))
vi.mock("@/components/message/AgentResultCards", () => ({ AgentResultCards: () => null }))
vi.mock("@/components/message/WorkLinkCards", () => ({ WorkLinkCards: () => null }))
const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/app/channel/c1" }))

const { TooltipProvider } = await import("@/components/ui/tooltip")
const { default: store } = await import("@/store/store")
const { ChannelMessageMobile } = await import("@/components/channel/channelMessageMobile")

afterEach(() => {
  cleanup()
  push.mockReset()
})

const checkin = () =>
  render(
    <Provider store={store}>
      <TooltipProvider>
        <ChannelMessageMobile
          postInfo={{
            post_uuid: "p1",
            post_text: "<p><strong>What did you work on today?</strong></p><p>Answer in this thread.</p>",
            post_by: { user_uuid: "checkin", user_name: "Check-in", is_bot: true },
            post_created_at: "2026-10-14T09:00:00Z",
            post_comment_count: 0,
          } as never}
          channelId="c1"
          addReaction={() => {}}
          removeReaction={() => {}}
          removePost={() => {}}
          updatePost={() => {}}
        />
      </TooltipProvider>
    </Provider>,
  )

describe("a check-in on a phone", () => {
  it("opens its thread from Answer", () => {
    checkin()
    fireEvent.click(screen.getByRole("button", { name: "Answer" }))
    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith("/app/channel/c1/p1")
  })

  it("still opens its thread from a tap elsewhere in the row", () => {
    checkin()
    fireEvent.click(screen.getByText("What did you work on today?"))
    expect(push).toHaveBeenCalledWith("/app/channel/c1/p1")
  })
})
