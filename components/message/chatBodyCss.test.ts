import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

// A message body's finishing (components/message/chatBody.css): code blocks
// on the sunken surface with one hairline and one padding (the editor's own
// border and inset doubled them), and the mention of you that stays a chip in
// the row that mentions you.

const css = readFileSync("components/message/chatBody.css", "utf8")
const rule = (selector: string) => {
  const at = css.indexOf(selector + " {")
  expect(at, selector).toBeGreaterThan(-1)
  return css.slice(at, css.indexOf("}", at))
}

describe("code in a message", () => {
  it("is one sunken block with one hairline and 10/12 of padding", () => {
    const pre = rule(".chat-body .minimal-tiptap-editor .ProseMirror pre")
    expect(pre).toMatch(/border:\s*0/)
    expect(pre).toMatch(/padding:\s*10px 12px/)
    expect(pre).toMatch(/background-color:\s*var\(--sunken\)/)
    expect(pre).toMatch(/box-shadow:\s*inset 0 0 0 1px var\(--line\)/)
    expect(rule(".chat-body .minimal-tiptap-editor .ProseMirror pre code")).toMatch(/padding:\s*0/)
  })

  it("outranks the editor's own rules whatever order they load in", () => {
    // One class more than ".minimal-tiptap-editor .ProseMirror pre" and ".chat-body .ProseMirror pre".
    for (const sel of css.match(/^[^\s/*@][^{]*\{/gm) ?? []) expect(sel).toMatch(/\.chat-body .*\.minimal-tiptap-editor/)
  })

  it("is loaded with the message bodies", () => {
    expect(readFileSync("components/textInput/textInput.tsx", "utf8")).toContain('import "@/components/message/chatBody.css"')
  })
})

describe("the mention of you in the row that mentions you", () => {
  it("keeps a visible edge on the row's own ground: a hairline of the accent, its fill and text unchanged", () => {
    const chip = rule('[data-for-me] .chat-body .minimal-tiptap-editor span[data-type="mention"].mention-me')
    expect(chip).toMatch(/box-shadow:\s*inset 0 0 0 1px color-mix\(in oklab, var\(--brand\) 24%, transparent\)/)
    expect(chip).not.toMatch(/background|color:/)
  })
})
