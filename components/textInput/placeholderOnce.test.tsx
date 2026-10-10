import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, waitFor } from "@testing-library/react"
import { SendHorizontal } from "@/lib/icons"
import { TooltipProvider } from "@/components/ui/tooltip"

// A message box's placeholder speaks for the whole box. It was set for every
// empty paragraph, so a line break under a draft showed "Message #general"
// again beneath the words already typed (seen on the phone, where Enter is a
// new line).

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

const composer = (content: string) =>
  render(
    <TooltipProvider>
      <MinimalTiptapTextInput
        throttleDelay={20}
        output="html"
        content={content}
        placeholder="Message #general"
        editable
        ButtonIcon={SendHorizontal}
        buttonOnclick={() => {}}
        attachmentOnclick={() => {}}
      />
    </TooltipProvider>,
  )

const shown = (container: HTMLElement) =>
  [...container.querySelectorAll(".ProseMirror p[data-placeholder]")]
    .map((p) => p.getAttribute("data-placeholder"))
    .filter(Boolean)

describe("a message box's placeholder", () => {
  it("shows while the box is empty", async () => {
    const { container } = composer("")
    await waitFor(() => expect(shown(container)).toEqual(["Message #general"]))
  })

  it("does not come back on an empty line under a draft", async () => {
    const { container } = composer("<p>Shipping the notes</p><p></p>")
    await waitFor(() => expect(container.querySelectorAll(".ProseMirror p").length).toBe(2))
    expect(shown(container)).toEqual([])
  })
})
