import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useEffect, useState } from "react"
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
const { useEscapeClosesPanel, escapeBelongsToLayer, editableTargetOf } = await import("./useEscapeClosesPanel")
const { default: ResizeableTextInput } = await import("@/components/resizeableTextInput/resizeableTextInput")
const { useDebounce } = await import("@/hooks/useDebounce")

function Panel({ onClose }: { onClose: () => void }) {
  useEscapeClosesPanel(true, onClose)
  return null
}

// A task's title as the task panel wires it: the field hands its text up at
// most every 3 s (ResizeableTextInput's throttle) and the panel saves it 500 ms
// after the last change (useDebounce). Closing the panel unmounts both.
function TaskTitle({ onSave }: { onSave: (name: string) => void }) {
  const [name, setName] = useState("")
  const saved = useDebounce(name, 500)
  useEffect(() => {
    if (saved) onSave(saved)
  }, [saved, onSave])
  return <ResizeableTextInput delay={3000} content="Launch plan" placeholder="Task name" textUpdate={setName} />
}

function TaskPanel({ onSave }: { onSave: (name: string) => void }) {
  const [open, setOpen] = useState(true)
  useEscapeClosesPanel(open, () => setOpen(false))
  return open ? (
    <section aria-label="Task">
      <TaskTitle onSave={onSave} />
    </section>
  ) : null
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
  vi.useRealTimers()
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

    // Nothing open now: the next Escape leaves the editor, and the one after
    // closes the panel.
    escape(editor.view.dom)
    expect(onClose).not.toHaveBeenCalled()
    escape(document.body)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("leaves a field on the first Escape, keeping what was typed, and closes the panel on the second", () => {
    vi.useFakeTimers()
    const onSave = vi.fn()
    render(<TaskPanel onSave={onSave} />)
    const title = screen.getByPlaceholderText("Task name")
    title.focus()
    fireEvent.change(title, { target: { value: "Launch plan, phase two" } })

    escape(title)
    expect(screen.queryByRole("region", { name: "Task" })).not.toBeNull()
    expect(document.activeElement).not.toBe(title)

    // The title saves as it would have had nobody pressed anything.
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(onSave).toHaveBeenCalledWith("Launch plan, phase two")

    escape(document.activeElement ?? document.body)
    expect(screen.queryByRole("region", { name: "Task" })).toBeNull()
  })

  it("counts text fields, selects and editors as fields, and buttons and checkboxes not", () => {
    document.body.innerHTML = `
      <input id="text" /><input id="search" type="search" /><input id="check" type="checkbox" />
      <textarea id="area"></textarea><select id="pick"></select><button id="go">Go</button>
      <div id="editor" contenteditable="true"><p id="line">Words</p></div>
      <div id="readonly" contenteditable="false"><p id="readline">Words</p></div>`
    const field = (id: string) => editableTargetOf({ target: document.getElementById(id) } as unknown as Event)?.id ?? null
    expect(field("text")).toBe("text")
    expect(field("search")).toBe("search")
    expect(field("area")).toBe("area")
    expect(field("pick")).toBe("pick")
    expect(field("editor")).toBe("editor")
    // Typing inside the editor: the editor is the field that is left.
    expect(field("line")).toBe("editor")
    expect(field("check")).toBeNull()
    expect(field("go")).toBeNull()
    expect(field("readonly")).toBeNull()
    expect(field("readline")).toBeNull()
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
