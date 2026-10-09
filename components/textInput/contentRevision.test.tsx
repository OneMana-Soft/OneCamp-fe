import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, waitFor } from "@testing-library/react"

// The composer's editor takes new content from its parent only once it has
// lost focus, since while someone types the parent's copy can lag behind it.
// A message that wasn't sent is put back while the person may still be in the
// composer, so the parent bumps contentRevision and the editor takes it then.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
// The chrome around the editor, which these tests don't need.
vi.mock("@/components/minimal-tiptap/components/section/two", () => ({ SectionTwo: () => null }))
vi.mock("@/components/minimal-tiptap/components/section/four", () => ({ SectionFour: () => null }))
vi.mock("@/components/minimal-tiptap/components/section/five", () => ({ SectionFive: () => null }))
vi.mock("@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu", () => ({ LinkBubbleMenu: () => null }))
vi.mock("@/components/minimal-tiptap/components/emoji-reaction/reaction-picker", () => ({ EmojiReactionPicker: () => null }))
vi.mock("@/components/clips/ClipButton", () => ({ ClipButton: () => null }))
vi.mock("@/components/messages/scheduleSendButton", () => ({ ScheduleSendButton: () => null }))

import MinimalTiptapTextInput from "./textInput"

afterEach(cleanup)

const composer = (content: string, contentRevision?: number) => (
  <MinimalTiptapTextInput content={content} contentRevision={contentRevision} editable output="html" onChange={() => {}} />
)

async function openComposer() {
  const view = render(composer(""))
  const editor = await waitFor(() => {
    const el = view.container.querySelector<HTMLElement>(".ProseMirror[contenteditable='true']")
    if (!el) throw new Error("no editor yet")
    return el
  })
  // Typing in it: the editor has focus.
  act(() => editor.focus())
  expect(document.activeElement).toBe(editor)
  return { ...view, editor }
}

describe("a composer with focus", () => {
  it("doesn't take new content from its parent", async () => {
    const { editor, rerender } = await openComposer()
    rerender(composer("<p>older typing</p>"))
    await act(async () => {})
    expect(editor.textContent).toBe("")
  })

  it("takes it when the parent bumps contentRevision: a message put back", async () => {
    const { editor, rerender } = await openComposer()
    rerender(composer("<p>Ship it on Friday</p>", 1))
    await waitFor(() => expect(editor.textContent).toBe("Ship it on Friday"))
    expect(document.activeElement).toBe(editor)
  })

  it("takes it again the next time a message is put back", async () => {
    const { editor, rerender } = await openComposer()
    rerender(composer("<p>first</p>", 1))
    await waitFor(() => expect(editor.textContent).toBe("first"))
    rerender(composer("", undefined))
    await waitFor(() => expect(editor.textContent).toBe(""))
    rerender(composer("<p>second</p>", 1))
    await waitFor(() => expect(editor.textContent).toBe("second"))
  })
})
