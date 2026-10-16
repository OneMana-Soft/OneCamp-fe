import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { Editor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"

import { Link, externalHref } from "./link"
import { inAppPath, useInternalLinkRouter } from "@/lib/utils/useInternalLinkRouter"

// A reader clicking a link in a doc lost the app's tab to the other site, and
// a link to the app's own page reloaded the whole app (L9). Now a link to
// another site opens in a new tab, telling it nothing (noopener noreferrer),
// and the app's own links open in the app.

const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))

afterEach(() => {
  cleanup()
  push.mockReset()
})

describe("a link in a doc", () => {
  it("to another site opens in a new tab, without telling it who sent the reader", () => {
    const editor = new Editor({
      extensions: [StarterKit, Link],
      content: `<p><a href="https://example.com/brief">brief</a> <a href="/app/doc/d2">our doc</a> <a href="${window.location.origin}/app/task/t1">a task</a> <a href="mailto:sam@example.com">mail</a></p>`,
    })
    const html = editor.getHTML()
    expect(html).toContain('href="https://example.com/brief" target="_blank" rel="noopener noreferrer"')
    expect(html).toMatch(/href="\/app\/doc\/d2"(?![^>]*target=)/)
    expect(html).toMatch(/href="http:\/\/localhost[^"]*\/app\/task\/t1"(?![^>]*target=)/)
    expect(html).toMatch(/href="mailto:sam@example.com"(?![^>]*target=)/)
    editor.destroy()
  })

  it("knows the app's own addresses, whole or as a path", () => {
    const origin = "https://onecamp.example.com"
    expect(externalHref("https://example.com/x", origin)).toBe(true)
    expect(externalHref(`${origin}/app/doc/1`, origin)).toBe(false)
    expect(externalHref("/app/doc/1", origin)).toBe(false)
    expect(inAppPath("/app/doc/1", origin)).toBe("/app/doc/1")
    expect(inAppPath(`${origin}/app/doc/1?c=2#x`, origin)).toBe("/app/doc/1?c=2#x")
    expect(inAppPath("https://example.com/app/doc/1", origin)).toBeNull()
  })

  it("to the app's own page opens it in the app, for a reader", async () => {
    const editor = new Editor({ extensions: [StarterKit, Link], editable: false, content: '<p><a href="/app/doc/d2">our doc</a></p>' })
    function Reader() {
      const route = useInternalLinkRouter(true)
      return (
        <div onClickCapture={route}>
          <EditorContent editor={editor} />
        </div>
      )
    }
    render(<Reader />)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
    const anchor = document.querySelector('a[href="/app/doc/d2"]')!
    const click = fireEvent.click(anchor)
    expect(push).toHaveBeenCalledWith("/app/doc/d2")
    expect(click).toBe(false) // the full-page navigation is prevented
    editor.destroy()
  })
})
