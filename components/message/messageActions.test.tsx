import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"

// A message's actions (react, reply, forward, save, more) exist only for the
// message under the pointer or holding focus. Every row used to mount its own
// hidden toolbar: about 600 components a message, so opening a channel or
// loading older messages built thousands of tooltips, menus and dialogs
// nobody could see, and each row added a dozen invisible tab stops.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: undefined, isLoading: false, mutate: () => {} }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }),
}))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/hooks/useUserInfoState", () => ({ useUserInfoState: () => ({}) }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKind: () => undefined, useBotKindMap: () => ({}) }))
vi.mock("@/services/aiService", () => ({ useTranslateText: () => ({ translateText: async () => null, isSubmitting: false }) }))
vi.mock("@/components/textInput/textInput", () => ({
  default: ({ content }: { content?: string }) => <div data-testid="body">{content}</div>,
}))
let toolbars = 0
vi.mock("@/components/MessageDesktopHover/messageDesktopHoverOptionsForMainChatAndChannel", () => ({
  MessageDesktopHoverOptionsForMainChatAndChannel: () => {
    toolbars++
    return <div role="toolbar" aria-label="Message actions"><button>React</button></div>
  },
}))
vi.mock("@/lib/utils/useInternalLinkRouter", () => ({ useInternalLinkRouter: () => undefined }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }), usePathname: () => "/app/channel/c1" }))
vi.mock("@/components/message/AgentResultCards", () => ({ AgentResultCards: () => null }))
vi.mock("@/components/message/WorkLinkCards", () => ({ WorkLinkCards: () => null }))

const { TooltipProvider } = await import("@/components/ui/tooltip")
const { default: store } = await import("@/store/store")
const { BaseMessageCard } = await import("@/components/message/baseMessageCard")

function row(continued = false) {
  return render(
    <Provider store={store}>
      <TooltipProvider>
        <BaseMessageCard
          message={{ uuid: "p1", bodyText: "<p>Load test is running now.</p>", from: { user_uuid: "maya", user_name: "Maya Chen" } as never, createdAt: "2026-10-10T09:01:00Z" }}
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

describe("a message's actions", () => {
  afterEach(() => {
    cleanup()
    toolbars = 0
  })

  it("are not built for a message nobody is pointing at", () => {
    row()
    expect(screen.queryByRole("toolbar")).toBeNull()
    expect(toolbars).toBe(0)
  })

  it("come with the pointer and go with it", () => {
    const { container } = row()
    const message = container.querySelector("#msg-p1")!
    fireEvent.pointerEnter(message)
    expect(screen.getByRole("toolbar", { name: "Message actions" })).toBeTruthy()
    fireEvent.pointerLeave(message)
    expect(screen.queryByRole("toolbar")).toBeNull()
  })

  it("come with keyboard focus on the author, after the message in the tab order", () => {
    const { container } = row()
    fireEvent.focus(screen.getByRole("button", { name: "Maya Chen" }))
    const bar = screen.getByRole("toolbar", { name: "Message actions" })
    const body = screen.getByTestId("body")
    expect(body.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.blur(container.querySelector("#msg-p1 button")!, { relatedTarget: document.body })
    expect(screen.queryByRole("toolbar")).toBeNull()
  })

  it("can be reached from a message that continues the one above, by its time", () => {
    const { container } = row(true)
    const gutter = container.querySelector<HTMLElement>("[tabindex='0']")!
    expect(gutter.textContent).toContain("Maya Chen")
    fireEvent.focus(gutter)
    expect(screen.getByRole("toolbar", { name: "Message actions" })).toBeTruthy()
  })
})

describe("a message sent from here that the server has not confirmed", () => {
  afterEach(cleanup)

  function pendingRow(sendState: "sending" | "failed") {
    return render(
      <Provider store={store}>
        <TooltipProvider>
          <BaseMessageCard
            message={{ uuid: "local-1", localId: "local-1", sendState, bodyText: "<p>Ship it</p>", from: { user_uuid: "me", user_name: "Sam Rivera" } as never, createdAt: "2026-10-10T09:01:00Z" }}
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
  }

  it("offers no actions while it has no id to act on, and says it is sending", () => {
    const { container } = pendingRow("sending")
    fireEvent.pointerEnter(container.querySelector("#msg-local-1")!)
    expect(screen.queryByRole("toolbar")).toBeNull()
    expect(screen.getByRole("status").textContent).toBe("Sending…")
  })

  it("says it was not sent", () => {
    pendingRow("failed")
    expect(screen.getByRole("alert").textContent).toContain("Not sent.")
  })
})
