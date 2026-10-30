import { afterEach, describe, expect, it } from "vitest"
import { Editor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { act, cleanup, render } from "@testing-library/react"
import { SlashCommand } from "./slashCommandExtension"
import { CHAT_COMMANDS } from "./slashCommand"
import { setBackendCommandProvider } from "@/components/command/commandItems"
import "@/components/docEditor/registry"
import { slashItemsFor } from "@/components/docEditor/registry/readers"

// A doc's "/", as the registry offers it: this edition registers no AI
// items, so even an open AI gate adds none.
const DOC_SLASH_COMMANDS = slashItemsFor("doc", { ai: true })

// Typing "/" in a doc opens the block menu as the area's CommandList, with
// its groups and shortcut chips; a query with no match says so, with no AI
// to ask on this edition.
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

  it("says no block matches, with no AI to ask", async () => {
    const editor = new Editor({ extensions: [StarterKit, SlashCommand.configure({ commands: DOC_SLASH_COMMANDS })], content: "<p></p>" })
    editors.push(editor)
    render(<EditorContent editor={editor} />)
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    await typeInto(editor, "/zzqq")
    const menu = document.querySelector("[data-slash-menu]")?.textContent
    expect(menu).toContain("No block called “zzqq”")
    expect(menu).not.toContain("Ask AI")
  })

  // MC-13: a chat composer's "/" leads with its commands, under "Commands";
  // it read "Blocks", as a doc's does.
  it("is headed Commands in a chat composer, and Blocks in a doc", async () => {
    // Filtered by what's typed, as the conversation's own provider is (useCommandRunner).
    const remove = setBackendCommandProvider((q) => [{ command: "remind", description: "Set a reminder", is_builtin: true }].filter((c) => c.command.includes(q)))
    try {
      const chat = new Editor({ extensions: [StarterKit, SlashCommand.configure({ commands: CHAT_COMMANDS, conversation: true })], content: "<p></p>" })
      editors.push(chat)
      render(<EditorContent editor={chat} />)
      await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
      await typeInto(chat, "/")
      const menu = document.querySelector("[data-slash-menu]")!
      expect(menu.querySelector('[role="listbox"]')!.getAttribute("aria-label")).toBe("Commands")
      // Named once, by its group: a header over it said "Commands" again.
      expect(menu.textContent!.split("Commands").length - 1).toBe(1)
      expect(menu.textContent).toContain("/remind")
      expect(menu.textContent).not.toContain("Blocks")
      await typeInto(chat, "zzqq")
      expect(document.querySelector("[data-slash-menu]")!.textContent).toContain("No command called “zzqq”")
    } finally {
      remove()
    }
    cleanup()
    while (editors.length) editors.pop()?.destroy()
    document.body.innerHTML = ""

    const doc = new Editor({ extensions: [StarterKit, SlashCommand.configure({ commands: DOC_SLASH_COMMANDS })], content: "<p></p>" })
    editors.push(doc)
    render(<EditorContent editor={doc} />)
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    await typeInto(doc, "/")
    expect(document.querySelector("[data-slash-menu]")!.textContent).toContain("Blocks")
  })
})
