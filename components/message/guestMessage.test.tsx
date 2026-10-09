import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

// The Guests bot ("guests") and an agent ("captain"), as the server names
// their kinds.
const KINDS: Record<string, string> = { guests: "guest", captain: "agent" }
vi.mock("@/hooks/useBotKinds", () => ({
  useBotKind: (uuid: string | undefined, isBot: boolean | undefined) => (isBot && uuid ? KINDS[uuid] : undefined),
}))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: undefined, isLoading: false, mutate: () => {} }),
  useFetchOnlyOnce: () => ({ data: undefined }),
}))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/hooks/useUserInfoState", () => ({ useUserInfoState: () => ({}) }))
vi.mock("@/services/aiService", () => ({ useTranslateText: () => ({ translateText: async () => null, isSubmitting: false }) }))
// The body as the editor would be given it, without an editor.
vi.mock("@/components/textInput/textInput", () => ({
  default: ({ content }: { content?: string }) => <div data-testid="body">{content}</div>,
}))
vi.mock("@/components/MessageDesktopHover/messageDesktopHoverOptionsForMainChatAndChannel", () => ({
  MessageDesktopHoverOptionsForMainChatAndChannel: () => null,
}))
vi.mock("@/lib/utils/useInternalLinkRouter", () => ({ useInternalLinkRouter: () => undefined }))
vi.mock("@/components/MessageDesktopHover/MessageDesktopHoverOptionsForRightPanelChatAndChannel", () => ({
  MessageDesktopHoverOptionsForRightPanelChatAndChannel: () => null,
}))
vi.mock("@/components/ai/SaveToMemoryButton", () => ({ SaveToMemoryButton: () => null }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }), usePathname: () => "/app/channel/c1" }))
vi.mock("@/components/message/AgentResultCards", () => ({ AgentResultCards: () => null }))
vi.mock("@/components/message/WorkLinkCards", () => ({ WorkLinkCards: () => null }))

const { default: store } = await import("@/store/store")
const { BaseMessageCard } = await import("@/components/message/baseMessageCard")
const { ChannelMessageMobile } = await import("@/components/channel/channelMessageMobile")
const { MessageContent } = await import("@/components/rightPanel/messageContent")

function renderMessage(from: { user_uuid: string; user_name: string; is_bot?: boolean }, bodyText: string) {
  return render(
    <Provider store={store}>
      <BaseMessageCard
        message={{ uuid: "p1", bodyText, from: from as never, createdAt: "2026-10-10T09:00:00Z" }}
        mediaGetUrl=""
        rightPanelConfig={{}}
        hoverOptionsConfig={{}}
        addReaction={() => {}}
        removeReaction={() => {}}
        removePost={() => {}}
        updatePost={() => {}}
      />
    </Provider>,
  )
}

const GUESTS_BOT = { user_uuid: "guests", user_name: "Guests", is_bot: true }
const STORED = "<p><strong>[Priya (Acme) (guest)]</strong></p><p>Looks good, ship it</p>"

// A guest's message read as the Guests bot's, with a GUEST tag over a bold
// "[Priya (Acme) (guest)]" line: "guest" twice, and the person in the text.
describe("a channel guest's message", () => {
  afterEach(cleanup)

  it("is by the guest, tagged Guest once, and says only what they wrote", () => {
    const { container } = renderMessage(GUESTS_BOT, STORED)
    expect(screen.getByText("Priya (Acme)")).toBeTruthy()
    expect(screen.queryByText("Guests")).toBeNull()
    expect(container.querySelectorAll('[aria-hidden="true"]')[0]?.textContent).toBe("Guest")
    expect(container.textContent?.match(/guest/gi)?.length, "one Guest tag, its spoken form, nothing else").toBe(2)
    expect(screen.getByTestId("body").textContent).toBe("<p>Looks good, ship it</p>")
    expect(container.querySelector("[data-guest-avatar]")?.textContent).toBe("P")
    // A guest has no profile to open.
    expect(screen.queryByRole("button", { name: "Priya (Acme)" })).toBeNull()
  })

  it("leaves anyone else's message, label or not, as it was", () => {
    renderMessage({ user_uuid: "captain", user_name: "Release Captain", is_bot: true }, STORED)
    expect(screen.getByRole("button", { name: "Release Captain" })).toBeTruthy()
    expect(screen.getByTestId("body").textContent).toBe(STORED)
  })
})

// The same message on a phone, and as a reply in a thread.
describe("a channel guest's message elsewhere", () => {
  afterEach(cleanup)

  function expectGuest(container: HTMLElement) {
    expect(screen.getByText("Priya (Acme)")).toBeTruthy()
    expect(screen.queryByText("Guests")).toBeNull()
    expect(container.textContent?.match(/guest/gi)?.length).toBe(2)
    expect(screen.getByTestId("body").textContent).toBe("<p>Looks good, ship it</p>")
    expect(container.querySelector("[data-guest-avatar]")).toBeTruthy()
  }

  it("reads the same in the mobile list", () => {
    const { container } = render(
      <Provider store={store}>
        <ChannelMessageMobile
          postInfo={{ post_uuid: "p1", post_text: STORED, post_by: GUESTS_BOT, post_created_at: "2026-10-10T09:00:00Z" } as never}
          channelId="c1"
          addReaction={() => {}}
          removeReaction={() => {}}
          removePost={() => {}}
          updatePost={() => {}}
        />
      </Provider>,
    )
    expectGuest(container)
  })

  it("reads the same as a thread reply", () => {
    const { container } = render(
      <Provider store={store}>
        <MessageContent
          userInfo={GUESTS_BOT as never}
          content={STORED}
          createdAt="2026-10-10T09:00:00Z"
          channelUUID="c1"
          postUUID="p1"
          commentUUID="r1"
          addReaction={() => {}}
          removeReaction={() => {}}
          updateMessage={() => {}}
          deleteMessage={() => {}}
          getMediaUrl=""
        />
      </Provider>,
    )
    expectGuest(container)
  })
})
