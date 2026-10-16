import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Provider } from "react-redux"
import { SendHorizontal } from "@/lib/icons"
import { TooltipProvider } from "@/components/ui/tooltip"

// MC-BUG-6: "+ › Create a poll" cleared the message box and put "/poll " in
// it, so whatever was being typed was gone (the chat box has no undo). An
// empty box still gets "/poll "; a message stays, as the poll's question.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu", () => ({ LinkBubbleMenu: () => null }))
vi.mock("@/hooks/useVoiceDictation", () => ({
  useVoiceDictation: () => ({ available: false, recording: false, transcribing: false, setup: { needed: false, sizeMb: null, progress: null }, start: vi.fn(), stop: vi.fn(), toggle: vi.fn() }),
  dictationLabel: () => "Dictate",
}))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => ({}), useBotKind: () => undefined }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined }), useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }) }))

// jsdom lays nothing out: ProseMirror measures ranges as it scrolls the caret into view.
if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => new DOMRect()
}

const { default: store } = await import("@/store/store")
const { default: MinimalTiptapTextInput } = await import("./textInput")

afterEach(cleanup)

/** A chat composer holding `html`; Create a poll chosen from "+"; what the box then holds. */
async function createPollFrom(html: string) {
  const { container } = render(
    <Provider store={store}>
      <TooltipProvider>
        <MinimalTiptapTextInput variant="chat" output="html" content={html} editable ButtonIcon={SendHorizontal} buttonOnclick={() => {}} />
      </TooltipProvider>
    </Provider>,
  )
  const box = await waitFor(() => {
    const pm = container.querySelector(".ProseMirror") as HTMLElement | null
    expect(pm?.textContent).toBe(new DOMParser().parseFromString(html, "text/html").body.textContent)
    return pm!
  })
  fireEvent.keyDown(screen.getByRole("button", { name: "Add to the message" }), { key: "Enter" })
  fireEvent.click(await waitFor(() => screen.getByRole("menuitem", { name: /Create a poll/ })))
  return box
}

describe("+ › Create a poll", () => {
  it("starts a poll in an empty message box", async () => {
    const box = await createPollFrom("")
    expect(box.textContent).toBe("/poll ")
  })

  it("keeps a message that was being typed, as the poll's question", async () => {
    const box = await createPollFrom('<p>Where should we eat on <strong>Friday</strong>? The "usual"?</p>')
    expect(box.textContent).toBe(`/poll "Where should we eat on Friday? The 'usual'?" `)
  })

  it("leaves a poll already being written as it is", async () => {
    const box = await createPollFrom('<p>/poll "Lunch?" "Pizza"</p>')
    expect(box.textContent).toBe('/poll "Lunch?" "Pizza" ')
  })
})
