import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { readFileSync } from "node:fs"

import { ACCESSORY_BAR_HEIGHT, DocAccessoryBar } from "./DocAccessoryBar"
import { pageOwnsBottomEdge } from "@/lib/utils/mobileBottomNav"

// On a phone, a toast landed on the bar above the keyboard (perf-mobile-design
// 5.1). Toasts sit 12px above --phone-floor, which a page that owns its bottom
// edge (a doc does) reads from --mobile-drawer-h, as a chat's composer
// publishes it. The doc's bar now publishes its top there while it shows.

afterEach(() => {
  cleanup()
  document.documentElement.style.removeProperty("--mobile-drawer-h")
})

const drawer = () => document.documentElement.style.getPropertyValue("--mobile-drawer-h")

describe("the doc's phone bar and the toasts", () => {
  it("publishes its top while it shows, and takes it back when it goes", () => {
    const editor = new Editor({ extensions: [StarterKit], content: "<p>x</p>" })
    render(<DocAccessoryBar editor={editor} onAIClick={() => {}} />)
    expect(drawer()).toBe("")
    act(() => {
      editor.emit("focus", { editor, event: new FocusEvent("focus"), transaction: editor.state.tr })
    })
    expect(drawer()).toBe(`${ACCESSORY_BAR_HEIGHT}px`)
    act(() => {
      editor.emit("blur", { editor, event: new FocusEvent("blur"), transaction: editor.state.tr })
    })
    expect(drawer()).toBe("")
    editor.destroy()
  })

  // The bar's code comes as its own chunk (docInput's lazyPart). A finger in
  // the text before it came left the editor focused with no bar, and Ask AI
  // out of reach until the text was tapped again (phoneSheets, wL, 25 Oct).
  it("shows when the editor was focused before the bar came", () => {
    const host = document.body.appendChild(document.createElement("div"))
    const editor = new Editor({ element: host, extensions: [StarterKit], content: "<p>x</p>" })
    editor.view.focus()
    expect(editor.isFocused).toBe(true)
    render(<DocAccessoryBar editor={editor} onAIClick={() => {}} />)
    expect(drawer()).toBe(`${ACCESSORY_BAR_HEIGHT}px`)
    editor.destroy()
    host.remove()
  })

  // V-72: with the keyboard up the app's frame is fitted to what it leaves,
  // and the bar, fixed inside that frame, sits on its bottom; raised by the
  // keyboard as well, it floated a keyboard's height over it. The toasts and
  // the corner cards are placed against the screen, so the foot it publishes
  // stays the keyboard and the bar.
  it("sits on the fitted frame's bottom with the keyboard up, publishing the keyboard and itself as the foot", async () => {
    const vv = Object.assign(new EventTarget(), { height: 508, offsetTop: 0 })
    const was = Object.getOwnPropertyDescriptor(window, "visualViewport")
    Object.defineProperty(window, "visualViewport", { configurable: true, value: vv })
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 })
    const editor = new Editor({ extensions: [StarterKit], content: "<p>x</p>" })
    try {
      render(<DocAccessoryBar editor={editor} onAIClick={() => {}} />)
      act(() => {
        editor.emit("focus", { editor, event: new FocusEvent("focus"), transaction: editor.state.tr })
      })
      const bar = () => document.querySelector<HTMLElement>("[data-doc-accessory-bar]")!
      // Not fitted (a pinch-zoomed page): the box is the screen, and the bar rises by the keyboard.
      expect(bar().style.bottom).toBe("336px")
      expect(drawer()).toBe(`${336 + ACCESSORY_BAR_HEIGHT}px`)
      // Fitted a frame later (lib/ui/visualViewport): the frame's bottom is the keyboard's top.
      await act(async () => {
        document.documentElement.setAttribute("data-keyboard", "open")
        await Promise.resolve()
      })
      expect(bar().style.bottom).toBe("0px")
      expect(drawer()).toBe(`${336 + ACCESSORY_BAR_HEIGHT}px`)
    } finally {
      editor.destroy()
      document.documentElement.removeAttribute("data-keyboard")
      if (was) Object.defineProperty(window, "visualViewport", was)
      else delete (window as unknown as Record<string, unknown>).visualViewport
    }
  })

  it("is read by the toasts on a doc page, which owns its bottom edge", () => {
    expect(pageOwnsBottomEdge("/app/doc/7d2c9a4e")).toBe(true)
    const bar = readFileSync("components/navigationBar/mobile/mobileNavigationBar.tsx", "utf8")
    expect(bar).toContain('"--phone-floor", "var(--mobile-drawer-h, env(safe-area-inset-bottom))"')
    // 12px above the floor, or above a call's dock while one is on screen (max() with --call-dock-floor).
    expect(readFileSync("components/ui/toast.tsx", "utf8")).toContain("bottom-[max(calc(var(--phone-floor)+12px),var(--call-dock-floor,0px))]")
  })
})
