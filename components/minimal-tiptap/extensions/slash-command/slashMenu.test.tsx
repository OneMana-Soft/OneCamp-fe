import { afterEach, describe, expect, it } from "vitest"
import { Editor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { act, cleanup, render } from "@testing-library/react"
import { SlashCommand } from "./slashCommandExtension"
import { DOC_SLASH_COMMANDS } from "./slashCommand"

// Typing "/" in a doc opens the block menu as the area's CommandList, with
// its groups and shortcut chips; a query with no match offers AI.
const editors: Editor[] = []
afterEach(() => {
  cleanup()
  while (editors.length) editors.pop()?.destroy()
  document.body.innerHTML = ""
})

async function typeInto(editor: Editor, text: string) {
  await act(async () => {
    editor.chain().focus("end").insertContent(text).run()
    await new Promise((r) => setTimeout(r, 50))
  })
}

describe("the slash menu", () => {
  it("opens grouped, with shortcut chips and a footer", async () => {
    const editor = new Editor({ extensions: [StarterKit, SlashCommand.configure({ commands: DOC_SLASH_COMMANDS })], content: "<p></p>" })
    editors.push(editor)
    render(<EditorContent editor={editor} />)
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    await typeInto(editor, "/")
    const menu = document.querySelector("[data-slash-menu]")
    expect(menu).toBeTruthy()
    expect(menu!.querySelector('[role="listbox"]')).toBeTruthy()
    expect(menu!.textContent).toContain("Basic")
    expect(menu!.textContent).toContain("Heading 1")
    expect(menu!.querySelector("kbd")?.textContent).toBe("#")
  })

  it("offers AI when nothing matches", async () => {
    const editor = new Editor({ extensions: [StarterKit, SlashCommand.configure({ commands: DOC_SLASH_COMMANDS })], content: "<p></p>" })
    editors.push(editor)
    render(<EditorContent editor={editor} />)
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    await typeInto(editor, "/zzqq")
    expect(document.querySelector("[data-slash-menu]")?.textContent).toContain("Ask AI to write “zzqq”")
  })
})
