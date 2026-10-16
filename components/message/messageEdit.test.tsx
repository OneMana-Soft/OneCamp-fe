import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

// Editing a message says how it ends (Escape to cancel, Enter to save), and
// Escape ends it unchanged. The edit opened with the full row of thirteen
// formatting icons, two unlabelled buttons and no way out by keyboard; then
// with a folded row inside a box five lines tall for a one-line message. It
// is the editor's "edit" variant now: the words, the emoji, nothing else.

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
  it("edits in place in the compact box, says how it ends, and ends unchanged on Escape", () => {
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
    fireEvent.focus(container.querySelector("#msg-p1")!)
    fireEvent.click(screen.getByRole("button", { name: "Edit message" }))
    expect(editorProps.editable).toBe(true)
    expect(editorProps.variant).toBe("edit")
    expect(container.textContent).toContain("esc cancel · ⏎ save")
    // Escape is the editor's own (textInput's onCancel, editKeys.test): a
    // handler on the row never saw it (F-05).
    expect(typeof editorProps.onCancel).toBe("function")
    act(() => void (editorProps.onCancel as () => boolean)())
    expect(editorProps.editable).toBe(false)
    expect(editorProps.variant).toBeUndefined()
    expect(updatePost).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain("Escape to cancel")
  })
})
