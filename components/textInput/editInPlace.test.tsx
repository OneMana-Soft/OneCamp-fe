import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { Provider } from "react-redux"
import { TooltipProvider } from "@/components/ui/tooltip"

// A message corrected in place (design v3 chat, C29) keeps its size: the words
// at the message's own 15/23, the emoji beside them, and nothing else in the
// box. It was a box five lines tall for a one-line message: the editor's own
// 12px inset inside the edit box's padding, over a row of formatting tools.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu", () => ({ LinkBubbleMenu: () => null }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => ({}), useBotKind: () => undefined }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined }), useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }) }))

const { default: store } = await import("@/store/store")
const { default: MinimalTiptapTextInput } = await import("./textInput")

afterEach(cleanup)

const edit = () =>
  render(
    <Provider store={store}>
      <TooltipProvider>
        <MinimalTiptapTextInput variant="edit" editable output="html" content="<p>Great. Then the only thing left is the announcement.</p>" buttonOnclick={() => {}} />
      </TooltipProvider>
    </Provider>,
  )

describe("a message being edited", () => {
  it("is only its words and the emoji, no tool row", async () => {
    const { container } = edit()
    const box = await waitFor(() => container.querySelector<HTMLElement>("[data-edit-box]")!)
    expect(box).toBeTruthy()
    expect(screen.getByRole("button", { name: "Insert emoji" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /formatting/i })).toBeNull()
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull()
  })

  it("adds no inset of its own: the caller's box is the only padding", async () => {
    const { container } = edit()
    const content = await waitFor(() => container.querySelector<HTMLElement>("[data-edit-box] .minimal-tiptap-editor")!)
    expect(content.className).not.toMatch(/\bp[xt]-3\b/)
    expect(content.className).toContain("chat-composer-editor")
  })
})
