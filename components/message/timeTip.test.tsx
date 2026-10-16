import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// SD-11: a message's full date and time was the browser's title on its clock:
// an OS box a second late, never on keyboard focus. It is the toolbar's own
// tip now (TIME_TIP): under the pointer after the tooltip delay, and at once
// while the row's own keyboard stop has the focus (the author's name, or a
// continued row's gutter), which adds no tab stop of its own.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: undefined, isLoading: false, mutate: () => {} }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me", user_name: "Sam Rivera" } } }),
}))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/hooks/useUserInfoState", () => ({ useUserInfoState: () => ({}) }))
vi.mock("@/hooks/useRelayedAuthor", () => ({ useRelayedAuthor: () => null }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKind: () => undefined, useBotKindMap: () => ({}) }))
vi.mock("@/services/aiService", () => ({ useTranslateText: () => ({ translateText: async () => null, isSubmitting: false }) }))
vi.mock("@/components/textInput/textInput", () => ({ default: ({ content }: { content?: string }) => <div data-testid="body">{content}</div> }))
vi.mock("@/lib/utils/useInternalLinkRouter", () => ({ useInternalLinkRouter: () => undefined }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }), usePathname: () => "/app/channel/c1" }))
vi.mock("@/components/message/AgentResultCards", () => ({ AgentResultCards: () => null }))
vi.mock("@/components/message/WorkLinkCards", () => ({ WorkLinkCards: () => null }))
vi.mock("@/components/channel/channelMessageAvatar", () => ({ ChannelMessageAvatar: () => <span /> }))

const { TooltipProvider } = await import("@/components/ui/tooltip")
const { default: store } = await import("@/store/store")
const { BaseMessageCard } = await import("@/components/message/baseMessageCard")
const { MessageContent } = await import("@/components/rightPanel/messageContent")
const { ContinuedGutter } = await import("@/components/message/continuedGutter")
const { formatFullTimestamp } = await import("@/lib/utils/date/formatTimeForPostOrComment")

const AT = "2026-10-10T09:01:00Z"

afterEach(cleanup)

/** The time's tip: its words, no title as well, under the pointer and with its row's keyboard stop. */
function expectTimeTip(time: HTMLElement, focusGroup: "name" | "gutter") {
  expect(time.dataset.tip).toBe(formatFullTimestamp(AT))
  expect(time.hasAttribute("title")).toBe(false)
  expect(time.className).toContain("after:content-[attr(data-tip)]")
  expect(time.className).toContain("hover:after:opacity-100")
  expect(time.className).toContain(focusGroup === "name" ? "group-has-[:focus-visible]/name:after:opacity-100" : "group-focus-visible/gutter:after:opacity-100")
  expect(time.hasAttribute("tabindex")).toBe(false)
}

describe("a message's full time", () => {
  it("is a tip on the clock in the list, shown when its author's name has the focus", () => {
    const { container } = render(
      <Provider store={store}>
        <TooltipProvider>
          <BaseMessageCard
            message={{ uuid: "p1", bodyText: "<p>Ship it</p>", from: { user_uuid: "maya", user_name: "Maya Chen" } as never, createdAt: AT } as never}
            mediaGetUrl=""
            rightPanelConfig={{}}
            hoverOptionsConfig={{}}
            addReaction={() => {}}
            removeReaction={() => {}}
            removePost={() => {}}
            updatePost={() => {}}
          />
        </TooltipProvider>
      </Provider>,
    )
    const time = container.querySelector<HTMLElement>("[data-name-line] time")!
    expectTimeTip(time, "name")
    const line = container.querySelector("[data-name-line]")!
    expect(line.className).toContain("group/name")
    expect(line.contains(screen.getByRole("button", { name: "Maya Chen" }))).toBe(true)
  })

  it("is a tip on the clock in a thread", () => {
    const { container } = render(
      <Provider store={store}>
        <MessageContent
          userInfo={{ user_uuid: "maya", user_name: "Maya Chen" } as never}
          createdAt={AT}
          content="<p>Shipped.</p>"
          commentUUID="c1"
          channelUUID="ch1"
          removeReaction={() => {}}
          addReaction={() => {}}
          updateMessage={() => {}}
          deleteMessage={() => {}}
          getMediaUrl=""
        />
      </Provider>,
    )
    expectTimeTip(container.querySelector<HTMLElement>("[data-name-line] time")!, "name")
    expect(container.querySelector("[data-name-line]")!.className).toContain("group/name")
  })

  it("is a tip on a continued row's clock, shown when its gutter has the focus", () => {
    const { container } = render(<ContinuedGutter createdAt={AT} authorName="Maya Chen" />)
    const time = container.querySelector<HTMLElement>("time")!
    expectTimeTip(time, "gutter")
    // Held to its left edge, over the message, not off the row.
    expect(time.className).toContain("after:left-0")
    const gutter = time.parentElement!
    expect(gutter.className).toContain("group/gutter")
    expect(gutter.tabIndex).toBe(0)
  })
})
