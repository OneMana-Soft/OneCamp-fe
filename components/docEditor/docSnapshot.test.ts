import { readFileSync } from "node:fs"
import { beforeAll, describe, expect, it } from "vitest"
import { SNAPSHOT_CLASSES, snapshotHtml } from "./snapshotHtml"
import { Editor } from "@tiptap/core"
import "@/components/docEditor/registry"
import { extensionsFor, loadBlocks } from "@/components/docEditor/registry/factory"
import { ALL_EDITIONS, bareContext } from "@/components/docEditor/registry/manifest"

// Opening a doc shows its saved text until the live editor has synced, then
// swaps. The two must take the same box, or the page jumps (it moved by 0.11
// opening the Q4 launch plan).

const dressed = (html: string) => {
  const t = document.createElement("template")
  t.innerHTML = snapshotHtml(html)
  return t.content
}

describe("a doc's saved copy", () => {
  // The doc's editor as the registry builds it, its own blocks loaded: every
  // lazy block, once, with time for a busy machine (a 5 s test ran out at 8 s).
  beforeAll(() => loadBlocks("doc", ALL_EDITIONS), 60_000)

  it("dresses each block in the class the editor gives it, which its spacing hangs on", () => {
    const c = dressed("<p>Intro</p><h2>Goals</h2><ul><li><p>One</p></li></ul><ol><li><p>Two</p></li></ol><blockquote><p>Quote</p></blockquote><pre><code>x</code></pre>")
    expect(c.querySelector("p")?.className).toBe("text-node")
    expect(c.querySelector("h2")?.className).toBe("heading-node")
    expect(c.querySelector("ul")?.className).toBe("list-node")
    expect(c.querySelector("ol")?.className).toBe("list-node")
    expect(c.querySelector("blockquote")?.className).toBe("block-node")
    expect(c.querySelector("pre")?.className).toBe("block-node")
  })

  it("draws a checklist item as the editor does: a box, then its text", () => {
    const c = dressed('<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Pricing page copy reviewed</p></li></ul>')
    const ul = c.querySelector("ul")!
    expect(ul.className).toBe("task-list")
    const li = ul.querySelector("li")!
    expect(li.className).toBe("task-item")
    expect(li.children[0].tagName).toBe("LABEL")
    expect(li.children[0].querySelector(".doc-snapshot-check")).toBeTruthy()
    expect(li.children[1].tagName).toBe("DIV")
    expect(li.children[1].querySelector("p.text-node")?.textContent).toBe("Pricing page copy reviewed")
  })

  it("is still sanitised", () => {
    const c = dressed('<p onclick="x()">Hi</p><script>alert(1)</script>')
    expect(c.querySelector("script")).toBeNull()
    expect(c.querySelector("p")?.getAttribute("onclick")).toBeNull()
  })

  it("uses the classes the editor is configured with, so the two cannot drift apart", () => {
    const editor = new Editor({ extensions: extensionsFor(bareContext("doc")) })
    const configured = (name: string) =>
      (editor.extensionManager.extensions.find((e) => e.name === name)?.options as { HTMLAttributes?: { class?: string } } | undefined)?.HTMLAttributes?.class
    const want = Object.fromEntries(SNAPSHOT_CLASSES.map(([sel, cls]) => [sel, cls]))
    expect(configured("paragraph")).toBe(want["p"])
    expect(configured("heading")).toBe(want["h1, h2, h3, h4, h5, h6"])
    expect(configured("blockquote")).toBe(want["blockquote"])
    expect(configured("bulletList")).toBe(want['ul:not([data-type="taskList"]), ol'])
    expect(configured("orderedList")).toBe(want['ul:not([data-type="taskList"]), ol'])
    expect(configured("codeBlock")).toBe(want["pre"])
    expect(configured("taskList")).toBe(want['ul[data-type="taskList"]'])
    expect(configured("taskItem")).toBe(want['li[data-type="taskItem"]'])
    editor.destroy()
    // Its first loadBlocks imports every lazy block cold, as other tests allow for.
  }, 30_000)

  it("stands in for an editor that is truly out of the layout, not hidden by a class the editor's own CSS beats", () => {
    const doc = readFileSync("components/docEditor/docInput.tsx", "utf8")
    expect(doc).toMatch(/sanitizer=\{snapshotHtml\}/)
    expect(doc).toMatch(/style=\{snapshot \? HIDDEN : undefined\}/)
    expect(doc).not.toMatch(/snapshot && 'hidden'/)
    // Why the class lost: .doc-editor sets display outside Tailwind's layers.
    const css = readFileSync("components/minimal-tiptap/styles/index.css", "utf8")
    expect(css).toMatch(/\.minimal-tiptap-editor\.doc-editor\s*\{[^}]*display:\s*flex/)
  })
})
