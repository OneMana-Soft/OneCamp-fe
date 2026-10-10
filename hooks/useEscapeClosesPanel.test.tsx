import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import Mention from "@tiptap/extension-mention"

// The people the mention picker would fetch.
vi.mock("@/lib/axiosInstance", () => ({
  default: {
    get: async () => ({
      status: 200,
      data: { users: [{ user_uuid: "u1", user_name: "Maya", user_full_name: "Maya Chen", user_handle: "maya", user_profile_object_key: "" }] },
    }),
  },
}))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: "" }) }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKind: () => undefined }))
vi.mock("@/components/ui/botTag", () => ({ BotTag: () => null }))

const { mentionSuggestionOptions } = await import("@/components/minimal-tiptap/extensions/mention-list/mentionList")
const { useEscapeClosesPanel, escapeBelongsToLayer } = await import("./useEscapeClosesPanel")

function Panel({ onClose }: { onClose: () => void }) {
  useEscapeClosesPanel(true, onClose)
  return null
}

const escape = (target: EventTarget) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))
  })

let editor: Editor | undefined
afterEach(() => {
  editor?.destroy()
  editor = undefined
  document.body.innerHTML = ""
  cleanup()
})

describe("Escape and the right panel", () => {
  it("closes only the mention popup when one is open, and the panel once nothing is", async () => {
    const onClose = vi.fn()
    render(<Panel onClose={onClose} />)
    const host = document.createElement("div")
    document.body.appendChild(host)
    editor = new Editor({
      element: host,
      extensions: [StarterKit, Mention.configure({ suggestion: mentionSuggestionOptions })],
    })

    act(() => {
      editor!.commands.focus()
      editor!.commands.insertContent("@ma")
    })
    await waitFor(() => expect(document.querySelector('.tippy-box[data-state="visible"]')).not.toBeNull())

    escape(editor.view.dom)
    expect(onClose).not.toHaveBeenCalled()
    await waitFor(() => expect(document.querySelector('.tippy-box[data-state="visible"]')).toBeNull())

    // Nothing open now: the next Escape, even typed in the same editor, closes the panel.
    escape(editor.view.dom)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("leaves Escape to an open menu or dialog, but not to a tooltip", () => {
    const press = () => new KeyboardEvent("keydown", { key: "Escape" })
    document.body.innerHTML = '<div data-radix-popper-content-wrapper><div role="tooltip">Send</div></div>'
    expect(escapeBelongsToLayer(press())).toBe(false)
    document.body.innerHTML = '<div data-radix-popper-content-wrapper><div>Pick a date</div></div>'
    expect(escapeBelongsToLayer(press())).toBe(true)
    document.body.innerHTML = '<div role="menu"></div>'
    expect(escapeBelongsToLayer(press())).toBe(true)
    document.body.innerHTML = '<div role="dialog"></div>'
    expect(escapeBelongsToLayer(press())).toBe(true)
  })

  it("does nothing for other keys, or once the panel is closed", () => {
    const onClose = vi.fn()
    const { rerender } = render(<Panel onClose={onClose} />)
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    })
    expect(onClose).not.toHaveBeenCalled()
    function Closed() {
      useEscapeClosesPanel(false, onClose)
      return null
    }
    rerender(<Closed />)
    escape(document.body)
    expect(onClose).not.toHaveBeenCalled()
  })
})
