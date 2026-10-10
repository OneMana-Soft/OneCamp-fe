import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, waitFor } from "@testing-library/react"

// Opening a task, a doc or anything with a rich-text field must not write it.
// Viewing a task in the demo sent POST /task/updateTaskDesc: on mount the
// editor's editable state was set with Tiptap's setEditable, which emits an
// "update" event by default although nothing changed, the field's onChange took
// that for an edit, and the debounced save sent the editor's HTML back.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/components/minimal-tiptap/components/section/two", () => ({ SectionTwo: () => null }))
vi.mock("@/components/minimal-tiptap/components/section/four", () => ({ SectionFour: () => null }))
vi.mock("@/components/minimal-tiptap/components/section/five", () => ({ SectionFive: () => null }))
vi.mock("@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu", () => ({ LinkBubbleMenu: () => null }))
vi.mock("@/components/minimal-tiptap/components/emoji-reaction/reaction-picker", () => ({ EmojiReactionPicker: () => null }))
vi.mock("@/components/clips/ClipButton", () => ({ ClipButton: () => null }))
vi.mock("@/components/messages/scheduleSendButton", () => ({ ScheduleSendButton: () => null }))

import MinimalTiptapTextInput from "./textInput"

afterEach(cleanup)

// What the task panel passes for a description (taskInfoPanel.tsx).
const description = (html: string, editable: boolean, onChange: (v: unknown) => void) => (
  <MinimalTiptapTextInput
    throttleDelay={20}
    output="html"
    content={html}
    value={html}
    placeholder="Add a description…"
    editable={editable}
    onChange={onChange}
  />
)

async function mounted(view: ReturnType<typeof render>, text: string) {
  await waitFor(() => {
    const el = view.container.querySelector<HTMLElement>(".ProseMirror")
    if (!el || !el.textContent?.includes(text)) throw new Error("not loaded yet")
  })
  // Past the throttle, so a queued onChange would have fired.
  await act(() => new Promise((r) => setTimeout(r, 150)))
}

describe("loading a description into its editor", () => {
  it("makes no update call, for someone who can edit it", async () => {
    const onChange = vi.fn()
    const view = render(description("<p>Draft for the blog and the newsletter.</p>", true, onChange))
    await mounted(view, "Draft for the blog")
    expect(onChange).not.toHaveBeenCalled()
  })

  it("makes no update call when stored as plain text the editor will wrap in a paragraph", async () => {
    const onChange = vi.fn()
    const view = render(description("Draft for the blog", true, onChange))
    await mounted(view, "Draft for the blog")
    expect(onChange).not.toHaveBeenCalled()
  })

  it("makes no update call when the right to edit arrives after the text", async () => {
    // The panel learns isAdmin with the task, so editable can flip after mount.
    const onChange = vi.fn()
    const view = render(description("<p>Check the numbers.</p>", false, onChange))
    await mounted(view, "Check the numbers")
    view.rerender(description("<p>Check the numbers.</p>", true, onChange))
    await act(() => new Promise((r) => setTimeout(r, 150)))
    expect(onChange).not.toHaveBeenCalled()
  })

  it("still reports a real edit", async () => {
    const onChange = vi.fn()
    const view = render(description("<p>Check the numbers.</p>", true, onChange))
    await mounted(view, "Check the numbers")
    const el = view.container.querySelector<HTMLElement>(".ProseMirror")!
    // ProseMirror reads typed text from DOM mutations.
    await act(async () => {
      el.querySelector("p")!.append(" Today.")
      await new Promise((r) => setTimeout(r, 150))
    })
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(String(onChange.mock.calls.at(-1)?.[0])).toContain("Today.")
  })
})
