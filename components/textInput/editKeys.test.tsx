import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { Provider } from "react-redux"
import { TooltipProvider } from "@/components/ui/tooltip"

// F-04: opening Edit message left focus on the page, so typed keys went
// nowhere. F-05: Escape didn't cancel, though the hint under the box says
// "esc cancel": the editor's keymap took it before the row's handler.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu", () => ({ LinkBubbleMenu: () => null }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => ({}), useBotKind: () => undefined }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined }), useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }) }))

const { default: store } = await import("@/store/store")
const { default: MinimalTiptapTextInput } = await import("./textInput")

afterEach(cleanup)

const edit = (onCancel?: () => boolean) =>
  render(
    <Provider store={store}>
      <TooltipProvider>
        <MinimalTiptapTextInput variant="edit" editable output="html" content="<p>Ship it Friday</p>" buttonOnclick={() => {}} onCancel={onCancel} />
      </TooltipProvider>
    </Provider>,
  )

describe("a message edited in place", () => {
  it("takes the caret as it opens", async () => {
    const { container } = edit()
    const box = await waitFor(() => container.querySelector<HTMLElement>("[data-edit-box] .ProseMirror")!)
    await waitFor(() => expect(document.activeElement).toBe(box))
  })

  it("cancels on Escape, from the editor itself", async () => {
    const onCancel = vi.fn(() => true)
    const { container } = edit(onCancel)
    const box = await waitFor(() => container.querySelector<HTMLElement>("[data-edit-box] .ProseMirror")!)
    fireEvent.keyDown(box, { key: "Escape" })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
