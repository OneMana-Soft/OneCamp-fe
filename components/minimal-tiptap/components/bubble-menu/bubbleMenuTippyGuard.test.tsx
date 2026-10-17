import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { installRangeRects } from "@/lib/testing/rangeRects"
import { BubbleMenu } from "./bubble-menu"

// The bubble menu floats on tippy.js, which @tiptap/extension-bubble-menu
// imports as its default. Node, loading that package for vitest, handed it
// tippy's CommonJS exports instead, so the menu's first show, 250 ms after a
// selection, threw "tippy is not a function": often after the test had passed,
// as an unhandled error, in any of some forty editor test files on a loaded
// machine. vitest.config.ts compiles the packages that import tippy with the
// tests, which reads its default as the app's own code does. This holds it:
// the real menu, past its wait, on tippy's own floating layer.

let restoreRects = () => {}
beforeAll(() => {
  restoreRects = installRangeRects({ x: 10, y: 10, width: 50, height: 16 })
})
afterAll(() => restoreRects())

const editors: Editor[] = []
afterEach(() => {
  cleanup()
  editors.splice(0).forEach((e) => e.destroy())
  document.body.innerHTML = ""
  vi.useRealTimers()
})

describe("the real bubble menu under vitest", () => {
  it("shows past its wait, on tippy's floating layer, and nothing throws", () => {
    vi.useFakeTimers()
    const host = document.createElement("div")
    document.body.appendChild(host)
    const editor = new Editor({ element: host, extensions: [StarterKit], content: "<p>Hello world</p>" })
    editors.push(editor)
    render(
      // Drawn after the editor, as an interactive tippy wants to be for the keyboard.
      <BubbleMenu editor={editor} shouldShow={() => true} tippyOptions={{ appendTo: "parent" }}>
        <button type="button">Bold</button>
      </BubbleMenu>,
    )
    act(() => void editor.commands.setTextSelection({ from: 1, to: 6 }))
    // Past the menu's 250 ms wait: where tippy is called.
    act(() => void vi.advanceTimersByTime(300))
    const layer = document.querySelector("[data-tippy-root]")
    expect(layer).not.toBeNull()
    expect(layer?.textContent).toContain("Bold")
  })

  // A Tiptap upgrade that brings another package importing tippy brings the
  // same throw with it: every such package is compiled with the tests.
  it("is compiled with the tests, as is every Tiptap package that imports tippy.js", () => {
    const root = path.join(__dirname, "..", "..", "..", "..")
    const store = path.join(root, "node_modules", ".pnpm")
    const importers = new Set<string>()
    for (const dir of readdirSync(store).filter((d) => d.startsWith("@tiptap+"))) {
      const scope = path.join(store, dir, "node_modules", "@tiptap")
      for (const name of existsSync(scope) ? readdirSync(scope) : []) {
        const pkgFile = path.join(scope, name, "package.json")
        if (!existsSync(pkgFile)) continue
        const pkg = JSON.parse(readFileSync(pkgFile, "utf8")) as { module?: string; exports?: { ".": { import?: string } } }
        const entry = pkg.exports?.["."]?.import ?? pkg.module
        const file = entry ? path.join(scope, name, entry) : ""
        if (file && existsSync(file) && /from ['"]tippy\.js['"]/.test(readFileSync(file, "utf8"))) importers.add(`@tiptap/${name}`)
      }
    }
    const inline = readFileSync(path.join(root, "vitest.config.ts"), "utf8").match(/inline:\s*\[([^\]]*)\]/)?.[1] ?? ""
    expect(importers.size).toBeGreaterThan(0)
    for (const name of importers) expect(inline, `${name} imports tippy.js`).toContain(`"${name}"`)
  })
})
