import { afterEach, describe, expect, it, vi } from "vitest"
import { Profiler } from "react"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import type { Editor } from "@tiptap/react"
import { Provider } from "react-redux"
import { SendHorizontal } from "@/lib/icons"
import { TooltipProvider } from "@/components/ui/tooltip"
import store from "@/store/store"

// Typing doesn't re-render the composer. Tiptap re-renders the component that
// holds the editor on every transaction unless told not to, and every
// keystroke re-rendered the composer with its buttons and tooltips: about 240
// components a key in a channel (scripts/fluidity, step 3). The editor draws
// the text itself; the composer re-renders only for what it shows from it.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu", () => ({ LinkBubbleMenu: () => null }))
vi.mock("@/components/clips/ClipButton", () => ({ ClipButton: () => null }))
vi.mock("@/components/messages/scheduleSendButton", () => ({ ScheduleSendButton: () => null }))

import MinimalTiptapTextInput from "./textInput"

afterEach(cleanup)

function composer() {
  let commits = 0
  const view = render(
    <Provider store={store}>
      <TooltipProvider>
        <Profiler id="composer" onRender={() => commits++}>
          <MinimalTiptapTextInput
            throttleDelay={20}
            output="html"
            content=""
            editable
            ButtonIcon={SendHorizontal}
            buttonOnclick={() => {}}
            attachmentOnclick={() => {}}
          />
        </Profiler>
      </TooltipProvider>
    </Provider>,
  )
  return { view, commits: () => commits }
}

const editorIn = (container: HTMLElement) =>
  (container.querySelector(".ProseMirror") as (HTMLElement & { editor?: Editor }) | null)?.editor

describe("typing in the composer", () => {
  it("re-renders it a handful of times for twenty keystrokes, not once a key", async () => {
    const { view, commits } = composer()
    await waitFor(() => expect(editorIn(view.container)).toBeTruthy())
    const editor = editorIn(view.container)!
    // The first character turns Send from "nothing to send" to ready: one
    // re-render the composer shows, and the only one typing should cost.
    const before = commits()
    for (const ch of "shipping it tomorrow") {
      act(() => {
        editor.commands.insertContent(ch)
      })
    }
    expect(editor.getText()).toBe("shipping it tomorrow")
    expect(commits() - before).toBeLessThanOrEqual(3)
  })

  it("still shows the editing controls only where it can be edited", async () => {
    const { view } = composer()
    await waitFor(() => expect(view.getByRole("button", { name: "Send" })).toBeTruthy())
    cleanup()
    const readOnly = render(
      <Provider store={store}>
        <TooltipProvider>
          <MinimalTiptapTextInput output="html" content="<p>Hello <img src='x'></p>" editable={false} isOutputText={false} />
        </TooltipProvider>
      </Provider>,
    )
    await waitFor(() => expect(readOnly.container.querySelector(".ProseMirror")).toBeTruthy())
    expect(readOnly.queryByRole("button", { name: "Send" })).toBeNull()
    expect(readOnly.queryByRole("button", { name: /formatting/i })).toBeNull()
  })
})
