import { describe, expect, it } from "vitest"
import { identityHue } from "@/lib/identityHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { collaboratorCaret, collaboratorSelection } from "./use-minimal-tiptap"

// Someone else's caret and selection in a doc carry their identity hue, the
// one their avatar wears everywhere (identityHue, by display name); not the colour their
// own browser picked.
describe("a collaborator in a doc", () => {
  const sam = { id: "289b6b5d-c30c-427a-bcec-634cb294f285", name: "Sam Rivera", color: "#ff00ff" }

  it("has a caret and name flag in their hue, with no colour of its own: first name on the flag, the whole name as its title", () => {
    const caret = collaboratorCaret(sam)
    expect(caret.classList.contains(HUE_CLASS[identityHue({ name: sam.name })])).toBe(true)
    expect(caret.getAttribute("style")).toBeNull()
    expect(caret.textContent).toBe("Sam")
    expect(caret.title).toBe("Sam Rivera")
    expect(collaboratorCaret({ ...sam, color: "#00ff00" }).className).toBe(caret.className)
  })

  it("flags an agent by its whole name, marked for its spark", () => {
    const agent = collaboratorCaret({ id: "a", name: "Release Captain", kind: "agent" })
    expect(agent.textContent).toBe("Release Captain")
    expect(agent.hasAttribute("data-agent")).toBe(true)
  })

  it("draws the flag in the avatar's gradient, and folds it to a dot (no legacy global rules)", async () => {
    const { readFileSync } = await import("node:fs")
    const css = readFileSync("components/minimal-tiptap/styles/index.css", "utf8")
    expect(css).toMatch(/linear-gradient\(140deg, var\(--hue-a1/)
    expect(css).toMatch(/content-caret-dot/)
    expect(readFileSync("app/globals.css", "utf8")).not.toMatch(/\.collaboration-cursor__label \{/)
  })

  it("has a selection washed in the same hue", () => {
    expect(collaboratorSelection(sam).class).toContain(HUE_CLASS[identityHue({ name: sam.name })])
    expect(collaboratorSelection(sam).style).toBe("")
  })
})
