import { afterEach, describe, expect, it, vi } from "vitest"
import { useState } from "react"
import { act, cleanup, render, screen } from "@testing-library/react"
import { Editor } from "@tiptap/react"
import { StarterKit } from "@tiptap/starter-kit"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { FormatAction } from "../types"
import { ToolbarSection } from "./toolbar-section"

// A toolbar section asked every button, on every transaction and again on
// every render, whether its command could run: `editor.can()`, a dry run of
// the command. A doc has five sections, and that was the slowest work on the
// page while typing. A section now reads the editor after the frame a
// transaction produced has painted, once for any number of transactions, and
// it is memoised, so a parent re-rendering doesn't ask again.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))

afterEach(cleanup)

const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 40)))

function setup() {
  const editor = new Editor({ element: document.createElement("div"), extensions: [StarterKit], content: "<p></p>" })
  const isActive = vi.fn((e: Editor) => e.isActive("bold"))
  const canExecute = vi.fn(() => true)
  const actions: FormatAction[] = [
    {
      value: "bold",
      label: "Bold",
      icon: <span>B</span>,
      action: (e: Editor) => e.chain().focus().toggleBold().run(),
      isActive,
      canExecute,
      shortcuts: ["mod", "B"],
    },
  ]
  let rerender = () => {}
  function Host() {
    const [, setTick] = useState(0)
    rerender = () => setTick((n) => n + 1)
    return <ToolbarSection editor={editor} actions={actions} mainActionCount={1} />
  }
  render(
    <TooltipProvider>
      <Host />
    </TooltipProvider>,
  )
  return { editor, isActive, canExecute, rerender: () => act(() => rerender()) }
}

describe("a toolbar section", () => {
  it("asks nothing of the editor while the keys go in, and once after", async () => {
    const { editor, isActive, canExecute } = setup()
    await settle()
    isActive.mockClear()
    canExecute.mockClear()
    for (const ch of "twenty keys of typing") act(() => void editor.commands.insertContent(ch))
    expect(canExecute).not.toHaveBeenCalled()
    expect(isActive).not.toHaveBeenCalled()
    await settle()
    expect(canExecute.mock.calls.length).toBeGreaterThan(0)
    expect(canExecute.mock.calls.length).toBeLessThanOrEqual(2)
  })

  it("still lights a button when its mark turns on", async () => {
    const { editor } = setup()
    await settle()
    expect(screen.getByRole("button", { name: "Bold" }).className).not.toContain("bg-accent")
    act(() => void editor.chain().toggleBold().insertContent("bold").run())
    await settle()
    expect(screen.getByRole("button", { name: "Bold" }).className).toContain("bg-accent")
  })

  it("doesn't re-render when its parent does", async () => {
    const { isActive, canExecute, rerender } = setup()
    await settle()
    isActive.mockClear()
    canExecute.mockClear()
    for (let i = 0; i < 5; i++) rerender()
    expect(isActive).not.toHaveBeenCalled()
    expect(canExecute).not.toHaveBeenCalled()
  })
})
