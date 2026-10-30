import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// A correction in a thread, to its message or a reply, keeps the box open on
// what was typed when the save fails, as in the list (F-06): it closed at
// once and the words were gone. Its Escape is the editor's own (F-05), and
// the save names the message by its id first.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: undefined, isLoading: false, mutate: () => {} }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "sam", user_name: "Sam Rivera" } } }),
}))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/hooks/useUserInfoState", () => ({ useUserInfoState: () => ({}) }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKind: () => undefined, useBotKindMap: () => ({}) }))
let editorProps: Record<string, unknown> = {}
vi.mock("@/components/textInput/textInput", () => ({
  default: (props: Record<string, unknown>) => {
    editorProps = props
    return <div data-testid="body">{String(props.content)}</div>
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

const { default: store } = await import("@/store/store")
const { MessageContent } = await import("@/components/rightPanel/messageContent")

afterEach(cleanup)

function renderRow(updateMessage: (id: string, body: string) => Promise<boolean>, ids: { postUUID?: string; commentUUID?: string }) {
  const { container } = render(
    <Provider store={store}>
      <MessageContent
        userInfo={{ user_uuid: "sam", user_name: "Sam Rivera" } as never}
        content="<p>Ship it on Friday</p>"
        createdAt="2026-10-14T09:00:00Z"
        channelUUID="c1"
        {...ids}
        addReaction={() => {}}
        removeReaction={() => {}}
        updateMessage={updateMessage}
        deleteMessage={() => {}}
        getMediaUrl=""
      />
    </Provider>,
  )
  fireEvent.pointerEnter(container.querySelector("[data-message-row]")!)
  fireEvent.click(screen.getByRole("button", { name: "Edit message" }))
}

describe("a correction in a thread", () => {
  it("opens again on what was typed when its save fails", async () => {
    const updateMessage = vi.fn(async () => false)
    renderRow(updateMessage, { commentUUID: "r1" })
    expect(editorProps.editable).toBe(true)
    act(() => void (editorProps.onChange as (s: string) => void)("<p>Ship it on Monday</p>"))
    await act(async () => void (editorProps.buttonOnclick as () => void)())
    expect(updateMessage).toHaveBeenCalledWith("r1", "<p>Ship it on Monday</p>")
    expect(editorProps.editable).toBe(true)
    expect(editorProps.content).toBe("<p>Ship it on Monday</p>")
  })

  it("closes on a save that worked, naming the thread's message by its id", async () => {
    const updateMessage = vi.fn(async () => true)
    renderRow(updateMessage, { postUUID: "p1" })
    act(() => void (editorProps.onChange as (s: string) => void)("<p>Ship it on Monday</p>"))
    await act(async () => void (editorProps.buttonOnclick as () => void)())
    expect(updateMessage).toHaveBeenCalledWith("p1", "<p>Ship it on Monday</p>")
    expect(editorProps.editable).toBe(false)
  })

  it("ends unchanged on the editor's Escape", () => {
    const updateMessage = vi.fn(async () => true)
    renderRow(updateMessage, { commentUUID: "r1" })
    expect(typeof editorProps.onCancel).toBe("function")
    act(() => void (editorProps.onCancel as () => boolean)())
    expect(editorProps.editable).toBe(false)
    expect(updateMessage).not.toHaveBeenCalled()
  })
})
