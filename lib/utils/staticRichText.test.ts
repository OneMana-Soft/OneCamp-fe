import { describe, expect, it } from "vitest"
import { canRenderStatically, mentionUserUUID } from "./staticRichText"

describe("canRenderStatically", () => {
  it("renders plain, formatted and linked text and person mentions without an editor", () => {
    expect(canRenderStatically('<p class="text-node">Ship <strong>it</strong> <a href="https://x.io">now</a></p>')).toBe(true)
    expect(canRenderStatically('<p><span data-type="mention" data-id="u1@0x2" data-label="Sam">@Sam</span> ok</p>')).toBe(true)
  })

  it("keeps the editor for anything that needs a live node view", () => {
    for (const html of [
      "<pre><code>go test</code></pre>",
      '<p><img src="a.png"></p>',
      "<table><tr><td>1</td></tr></table>",
      '<ul data-type="taskList"><li data-checked="true">done</li></ul>',
      '<p><span data-type="referenceMention" data-id="t1">Task</span></p>',
    ]) expect(canRenderStatically(html)).toBe(false)
  })

  it("does nothing for content that is not HTML text", () => {
    expect(canRenderStatically(undefined)).toBe(false)
    expect(canRenderStatically({ type: "doc" })).toBe(false)
  })
})

describe("mentionUserUUID", () => {
  it("drops the graph uid suffix", () => {
    expect(mentionUserUUID("abc-123@0x4f")).toBe("abc-123")
    expect(mentionUserUUID(undefined)).toBe("")
  })
})
