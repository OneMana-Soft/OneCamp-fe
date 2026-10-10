import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import type { Editor } from "@tiptap/react"
import { SendHorizontal } from "@/lib/icons"
import { TooltipProvider } from "@/components/ui/tooltip"

// A keystroke redraws the editor and nothing around it. The editor re-renders
// its host on every keystroke, and the whole composer went with it: the
// link popover, the clip recorder, send later and every button's tooltip,
// about 220 components a key on the demo, and every 300 ms the channel's
// header too. The buttons are drawn again only when Send turns ready.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/components/minimal-tiptap/components/section/two", () => ({ SectionTwo: () => null }))
vi.mock("@/components/minimal-tiptap/components/section/four", () => ({ SectionFour: () => null }))
vi.mock("@/components/minimal-tiptap/components/section/five", () => ({ SectionFive: () => null }))
vi.mock("@/components/minimal-tiptap/components/emoji-reaction/reaction-picker", () => ({ EmojiReactionPicker: () => null }))

const renders = { clip: 0, schedule: 0, link: 0 }
vi.mock("@/components/clips/ClipButton", () => ({
  ClipButton: () => {
    renders.clip++
    return null
  },
}))
vi.mock("@/components/messages/scheduleSendButton", () => ({
  ScheduleSendButton: () => {
    renders.schedule++
    return null
  },
}))
vi.mock("@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu", () => ({
  LinkBubbleMenu: () => {
    renders.link++
    return null
  },
}))

import MinimalTiptapTextInput from "./textInput"

afterEach(() => {
  cleanup()
  renders.clip = renders.schedule = renders.link = 0
})

describe("typing in a message box", () => {
  it("redraws the editor, not the buttons beside it", async () => {
    const { container, rerender } = render(
      <TooltipProvider>
        <MinimalTiptapTextInput
          throttleDelay={300}
          output="html"
          content=""
          editable
          ButtonIcon={SendHorizontal}
          buttonOnclick={() => {}}
          onSchedule={() => {}}
          attachmentOnclick={() => {}}
          onActionFiles={() => {}}
        />
      </TooltipProvider>,
    )
    const view = await waitFor(() => {
      const el = container.querySelector(".ProseMirror") as (HTMLElement & { editor?: Editor }) | null
      expect(el?.editor).toBeTruthy()
      return el!.editor!
    })
    // The first character turns Send ready: one redraw of the buttons.
    act(() => {
      view.commands.insertContent("S")
    })
    const after = { ...renders }
    for (const ch of "hip it") {
      act(() => {
        view.commands.insertContent(ch)
      })
    }
    expect(renders).toEqual(after)

    // A parent re-rendering with new handlers (a new closure each render, as
    // every conversation view passes) leaves the buttons as they were.
    rerender(
      <TooltipProvider>
        <MinimalTiptapTextInput
          throttleDelay={300}
          output="html"
          content=""
          editable
          ButtonIcon={SendHorizontal}
          buttonOnclick={() => {}}
          onSchedule={() => {}}
          attachmentOnclick={() => {}}
          onActionFiles={() => {}}
        />
      </TooltipProvider>,
    )
    expect(renders.link).toBe(after.link)
    expect(renders.schedule).toBe(after.schedule)
  })
})
