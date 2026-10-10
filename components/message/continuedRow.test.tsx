import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

// The Guests bot ("guests"), the Slack bot ("slack") and an agent
// ("captain"), as the server names their kinds.
const KINDS: Record<string, string> = { guests: "guest", slack: "bridge", captain: "agent" }
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

const { TooltipProvider } = await import("@/components/ui/tooltip")
const { default: store } = await import("@/store/store")
const { BaseMessageCard } = await import("@/components/message/baseMessageCard")

function renderRow(continued: boolean) {
  return render(
    <Provider store={store}>
      <TooltipProvider>
        <BaseMessageCard
          message={{ uuid: "p2", bodyText: "<p>And the second half.</p>", from: { user_uuid: "maya", user_name: "Maya Chen" } as never, createdAt: "2026-10-10T09:01:00Z" }}
          mediaGetUrl=""
          rightPanelConfig={{}}
          hoverOptionsConfig={{}}
          addReaction={() => {}}
          removeReaction={() => {}}
          removePost={() => {}}
          updatePost={() => {}}
          continued={continued}
        />
      </TooltipProvider>
    </Provider>,
  )
}

// The second of two messages Maya sent a minute apart (lib/messageGrouping).
describe("a message that continues the one above it", () => {
  afterEach(cleanup)

  it("draws no avatar or name, keeps the body, and still says who wrote it to a screen reader", () => {
    const { container } = renderRow(true)
    expect(screen.queryByRole("button", { name: "Maya Chen" })).toBeNull()
    expect(container.querySelector("[data-slot=avatar], .h-9.w-9")).toBeNull()
    expect(screen.getByTestId("body").textContent).toBe("<p>And the second half.</p>")
    expect(container.querySelector(".sr-only")?.textContent).toMatch(/^Maya Chen, /)
    expect(container.querySelector("time")?.className).toContain("group-hover:opacity-100")
  })

  it("is drawn in full when it starts a turn", () => {
    renderRow(false)
    expect(screen.getByRole("button", { name: "Maya Chen" })).toBeTruthy()
  })
})
