import { describe, expect, it } from "vitest"
import { hueFor } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { collaboratorCaret, collaboratorSelection } from "./use-minimal-tiptap"

// Someone else's caret and selection in a doc carry their identity hue, from
// their id, like their avatar; not the colour their own browser picked.
describe("a collaborator in a doc", () => {
  const sam = { id: "289b6b5d-c30c-427a-bcec-634cb294f285", name: "Sam Rivera", color: "#ff00ff" }

  it("has a caret and name tag in their hue, with no colour of its own", () => {
    const caret = collaboratorCaret(sam)
    expect(caret.classList.contains(HUE_CLASS[hueFor(sam.id)])).toBe(true)
    expect(caret.getAttribute("style")).toBeNull()
    expect(caret.textContent).toBe("Sam Rivera")
    expect(collaboratorCaret({ ...sam, color: "#00ff00" }).className).toBe(caret.className)
  })

  it("has a selection washed in the same hue", () => {
    expect(collaboratorSelection(sam).class).toContain(HUE_CLASS[hueFor(sam.id)])
    expect(collaboratorSelection(sam).style).toBe("")
  })
})
