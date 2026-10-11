import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const src = readFileSync("components/docEditor/docInput.tsx", "utf8")
const bar = readFileSync("components/docEditor/SelectionBar.tsx", "utf8")

// content.md D08: no permanent formatting row. Formatting floats on a
// selection; a phone gets a bar above its keyboard instead.
describe("the doc's formatting", () => {
  it("has no toolbar row at rest on a computer", () => {
    expect(src).not.toMatch(/data-doc-toolbar/)
    expect(src).toMatch(/canEdit && !isMobile && \(\s*<SelectionBar/)
  })

  it("floats on a selection: Ask AI, Turn into, bold first, colour, comment", () => {
    expect(bar).toMatch(/<BubbleMenu/)
    expect(bar).toMatch(/<FloatingBar /)
    const order = ["Ask AI", "Turn into", '"Bold"', '"Italic"', '"Underline"', '"Strikethrough"', '"Inline code"', "Text colour", '"Comment"']
    const jsx = bar.slice(bar.indexOf("<BubbleMenu"))
    const at = order.map((l) => jsx.indexOf(l))
    expect(at.every((i) => i >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })

  it("reaches the bar from the keyboard (Alt-F10)", () => {
    expect(bar).toMatch(/e\.altKey && e\.key === "F10"/)
  })

  it("follows the editor itself, so typing doesn't render the frame", () => {
    expect(bar).toMatch(/useEditorState\(/)
    expect(src).toMatch(/shouldRerenderOnTransaction:\s*false/)
  })

  it("docks a bar above the phone's keyboard instead", () => {
    expect(src).toMatch(/canEdit && isMobile && !focusMode && <DocAccessoryBar/)
  })
})

describe("a doc on a phone", () => {
  const view = readFileSync("components/views/DocView.tsx", "utf8")
  it("adds no bar of its own under the app bar unless someone else is here", () => {
    expect(view).toMatch(/isMobile && awarenessUsers\.length > 1 &&/)
    const phoneRow = view.slice(view.indexOf("data-doc-presence-row"), view.indexOf("data-doc-presence-row") + 300)
    expect(phoneRow).not.toMatch(/DocHeader/)
  })
})
