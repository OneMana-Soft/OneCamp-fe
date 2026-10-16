import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

// A Check-in's question is the prompt card on a phone too (design v3 chat,
// C13), with Answer. The phone drew it as a plain post: the demo guide's
// first step, "Answer today's check-in", led there to nothing to press.

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
let editorProps: Record<string, unknown> = {}
vi.mock("@/components/textInput/textInput", () => ({
  default: (props: Record<string, unknown>) => {
    editorProps = props
    return <div data-testid="body">{String(props.content)}</div>
  },
}))
vi.mock("@/lib/utils/useInternalLinkRouter", () => ({ useInternalLinkRouter: () => undefined }))
vi.mock("@/components/message/AgentResultCards", () => ({ AgentResultCards: () => null }))
vi.mock("@/components/message/WorkLinkCards", () => ({ WorkLinkCards: () => null }))

const { TooltipProvider } = await import("@/components/ui/tooltip")
const { default: store } = await import("@/store/store")
const { MobileMessageRow } = await import("@/components/message/mobileMessageRow")

afterEach(cleanup)

const row = (from: { user_uuid: string; user_name: string; is_bot?: boolean }, extra: Record<string, unknown> = {}) => {
  const onOpen = vi.fn()
  render(
    <Provider store={store}>
      <TooltipProvider>
      <MobileMessageRow
        message={{
          uuid: "p1",
          bodyText: "<p><strong>What did you work on today?</strong></p><p>Answer in this thread.</p>",
          from: from as never,
          createdAt: "2026-10-09T21:00:00Z",
          commentCount: 2,
          comments: [{ comment_created_at: "2026-10-09T21:30:00Z", comment_by: { user_uuid: "maya", user_name: "Maya Chen" } }] as never,
        }}
        editing={false}
        onEditSave={() => {}}
        onEditCancel={() => {}}
        onOpen={onOpen}
        onUserClick={() => {}}
        longPress={{}}
        addReaction={() => {}}
        removeReaction={() => {}}
        onSelectAttachment={() => {}}
        mediaGetUrl=""
        {...extra}
      />
      </TooltipProvider>
    </Provider>,
  )
  return onOpen
}

describe("a Check-in on a phone", () => {
  it("is the prompt card with who answered and Answer, which opens its thread once", () => {
    const onOpen = row({ user_uuid: "checkin", user_name: "Check-in", is_bot: true })
    expect(document.querySelector("[data-checkin-card]")).toBeTruthy()
    expect(screen.getByText("2 answered")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Answer" }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it("is not a card for anyone else's message", () => {
    row({ user_uuid: "maya", user_name: "Maya Chen" })
    expect(document.querySelector("[data-checkin-card]")).toBeNull()
    expect(screen.queryByRole("button", { name: "Answer" })).toBeNull()
  })

  it("edits in place at its own size, as on a desktop", () => {
    row({ user_uuid: "sam", user_name: "Sam Rivera" }, { editing: true })
    expect(editorProps.variant).toBe("edit")
  })
})
