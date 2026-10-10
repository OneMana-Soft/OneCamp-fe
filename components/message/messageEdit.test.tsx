import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

// Editing a message says how it ends (Escape to cancel, Enter to save), and
// Escape ends it unchanged. The edit opened with the full row of thirteen
// formatting icons, two unlabelled buttons and no way out by keyboard.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: undefined, isLoading: false, mutate: () => {} }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "sam" } } }),
}))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/hooks/useUserInfoState", () => ({ useUserInfoState: () => ({}) }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKind: () => undefined, useBotKindMap: () => ({}) }))
vi.mock("@/services/aiService", () => ({ useTranslateText: () => ({ translateText: async () => null, isSubmitting: false }) }))
let editorProps: Record<string, unknown> = {}
vi.mock("@/components/textInput/textInput", () => ({
  default: (props: Record<string, unknown>) => {
    editorProps = props
    return <div data-testid="body" tabIndex={0}>{String(props.content)}</div>
  },
}))
vi.mock("@/components/MessageDesktopHover/messageDesktopHoverOptionsForMainChatAndChannel", () => ({
  MessageDesktopHoverOptionsForMainChatAndChannel: ({ editMessage }: { editMessage: () => void }) => (
    <div role="toolbar" aria-label="Message actions"><button onClick={editMessage}>Edit message</button></div>
  ),
}))
vi.mock("@/lib/utils/useInternalLinkRouter", () => ({ useInternalLinkRouter: () => undefined }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }), usePathname: () => "/app/channel/c1" }))
vi.mock("@/components/message/AgentResultCards", () => ({ AgentResultCards: () => null }))
vi.mock("@/components/message/WorkLinkCards", () => ({ WorkLinkCards: () => null }))

const { TooltipProvider } = await import("@/components/ui/tooltip")
const { default: store } = await import("@/store/store")
const { BaseMessageCard } = await import("@/components/message/baseMessageCard")

afterEach(cleanup)

describe("editing a message", () => {
  it("folds its formatting, says how it ends, and ends unchanged on Escape", () => {
    const updatePost = vi.fn()
    const { container } = render(
      <Provider store={store}>
        <TooltipProvider>
          <BaseMessageCard
            message={{ uuid: "p1", bodyText: "<p>Great.</p>", from: { user_uuid: "sam", user_name: "Sam Rivera" } as never, createdAt: "2026-10-10T09:01:00Z" }}
            mediaGetUrl=""
            rightPanelConfig={{}}
            hoverOptionsConfig={{}}
            addReaction={() => {}}
            removeReaction={() => {}}
            removePost={() => {}}
            updatePost={updatePost}
          />
        </TooltipProvider>
      </Provider>,
    )
    fireEvent.pointerEnter(container.querySelector("#msg-p1")!)
    fireEvent.click(screen.getByRole("button", { name: "Edit message" }))
    expect(editorProps.editable).toBe(true)
    expect(editorProps.toggleToolbar).toBe(true)
    expect(container.textContent).toContain("Escape to cancel · Enter to save")
    fireEvent.keyDown(screen.getByTestId("body"), { key: "Escape" })
    expect(editorProps.editable).toBe(false)
    expect(updatePost).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain("Escape to cancel")
  })
})
