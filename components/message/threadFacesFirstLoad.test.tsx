import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

/**
 * A thread's faces on first load (chat P2; found by DESIGN-BUILD-2, 18 Oct).
 * A page of messages read each message's replies only for the newest one's
 * time, so the faces beside "N replies" came only from replies that arrived
 * during the session: the demo's seeded threads said "2 replies · Last reply
 * …" with nobody beside it, and a check-in "2 answered" with no faces. The
 * page now carries up to three people per thread (domain/Message
 * KeepRepliers): each once, the last the latest reply, a guest as the label
 * naming them. These are those answers, as a page brings them.
 */

const KINDS: Record<string, string> = { guests: "guest", checkins: "checkin" }
vi.mock("@/hooks/useBotKinds", () => ({
  useBotKind: (uuid: string | undefined, isBot: boolean | undefined) => (isBot && uuid ? KINDS[uuid] : undefined),
  useBotKindMap: () => KINDS,
}))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: undefined, isLoading: false, mutate: () => {} }),
  useFetchOnlyOnce: () => ({ data: undefined }),
}))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/hooks/useUserInfoState", () => ({ useUserInfoState: () => ({}) }))
vi.mock("@/components/textInput/textInput", () => ({
  default: ({ content }: { content?: string }) => <div data-testid="body">{content}</div>,
}))
vi.mock("@/components/MessageDesktopHover/messageDesktopHoverOptionsForMainChatAndChannel", () => ({
  MessageDesktopHoverOptionsForMainChatAndChannel: () => null,
}))
vi.mock("@/lib/utils/useInternalLinkRouter", () => ({ useInternalLinkRouter: () => undefined }))
vi.mock("@/components/ai/SaveToMemoryButton", () => ({ SaveToMemoryButton: () => null }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/app/channel/c1" }))
vi.mock("@/components/message/AgentResultCards", () => ({ AgentResultCards: () => null }))
vi.mock("@/components/message/WorkLinkCards", () => ({ WorkLinkCards: () => null }))

const { TooltipProvider } = await import("@/components/ui/tooltip")
const { default: store } = await import("@/store/store")
const { BaseMessageCard } = await import("@/components/message/baseMessageCard")

const JONAS = { user_uuid: "u-jonas", user_name: "jonas", user_full_name: "Jonas Weber" }
const MAYA = { user_uuid: "u-maya", user_name: "maya", user_full_name: "Maya Chen" }
const GUESTS = { user_uuid: "guests", user_name: "Guests", is_bot: true }
const CHECKINS = { user_uuid: "checkins", user_name: "Check-ins", is_bot: true }

// A page's replies for one thread: oldest of the people first, the last the
// latest reply; a guest's carrying only the label naming them.
const FROM_PAGE = [
  { comment_uuid: "c3", comment_created_at: "2026-10-18T10:03:00Z", comment_by: JONAS },
  { comment_uuid: "c4", comment_created_at: "2026-10-18T10:04:00Z", comment_by: MAYA },
  { comment_uuid: "c5", comment_created_at: "2026-10-18T10:05:00Z", comment_by: GUESTS, comment_text: "<p><strong>[Priya (Acme) (guest)]</strong></p>" },
]

function card(from: { user_uuid: string; user_name: string; is_bot?: boolean }, comments: unknown[], commentCount: number) {
  return (
    <Provider store={store}>
      <TooltipProvider>
        <BaseMessageCard
          message={{ uuid: "p1", bodyText: "<p>Ship it Friday?</p>", from: from as never, createdAt: "2026-10-18T09:00:00Z", comments: comments as never, commentCount }}
          mediaGetUrl=""
          rightPanelConfig={{}}
          hoverOptionsConfig={{}}
          addReaction={() => {}}
          removeReaction={() => {}}
          removePost={() => {}}
          updatePost={() => {}}
        />
      </TooltipProvider>
    </Provider>
  )
}

function renderMessage(from: { user_uuid: string; user_name: string; is_bot?: boolean }, comments: unknown[], commentCount: number) {
  return render(card(from, comments, commentCount))
}

const facesIn = (container: HTMLElement) => [...container.querySelectorAll("[data-participant]")].map((f) => f.textContent)

const SAM = { user_uuid: "u-sam", user_name: "sam", user_full_name: "Sam Rivera" }
// A reply that arrives in the session, as the store adds it: at the end, with its author.
const live = (n: number, by: object) => ({ comment_uuid: `l${n}`, comment_created_at: `2026-10-18T10:1${n}:00Z`, comment_text: "", comment_by: by })

describe("a thread's faces on first load", () => {
  afterEach(cleanup)

  it("are its people from the page, newest first, a guest as herself", () => {
    const { container } = renderMessage({ user_uuid: "u-sam", user_name: "Sam Rivera" }, FROM_PAGE, 5)
    expect(facesIn(container)).toEqual(["P", "M", "J"])
    expect(container.textContent).toContain("5 replies")
  })

  it("are under a check-in's answers too", () => {
    const { container } = renderMessage(CHECKINS, FROM_PAGE.slice(0, 2), 2)
    expect(facesIn(container)).toEqual(["M", "J"])
  })

  it("take a reply written now once: its writer first, three at most, no count of the rest", () => {
    const { container, rerender } = renderMessage({ user_uuid: "u-x", user_name: "Ola" }, FROM_PAGE, 5)
    // Sam joins: the newest three, Jonas makes room, and no "+1".
    rerender(card({ user_uuid: "u-x", user_name: "Ola" }, [...FROM_PAGE, live(1, SAM)], 6))
    expect(facesIn(container)).toEqual(["S", "P", "M"])
    expect(container.querySelector("[data-participants]")?.textContent).not.toMatch(/\+\d/)
    // Maya again: still three, Maya first, nobody twice.
    rerender(card({ user_uuid: "u-x", user_name: "Ola" }, [...FROM_PAGE, live(1, SAM), live(2, MAYA)], 7))
    expect(facesIn(container)).toEqual(["M", "S", "P"])
    expect(container.textContent).toContain("7 replies")
  })
})
