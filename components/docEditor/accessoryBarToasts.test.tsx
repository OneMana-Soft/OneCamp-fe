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

  it("is read by the toasts on a doc page, which owns its bottom edge", () => {
    expect(pageOwnsBottomEdge("/app/doc/7d2c9a4e")).toBe(true)
    const bar = readFileSync("components/navigationBar/mobile/mobileNavigationBar.tsx", "utf8")
    expect(bar).toContain('"--phone-floor", "var(--mobile-drawer-h, env(safe-area-inset-bottom))"')
    // 12px above the floor, or above a call's dock while one is on screen (max() with --call-dock-floor).
    expect(readFileSync("components/ui/toast.tsx", "utf8")).toContain("bottom-[max(calc(var(--phone-floor)+12px),var(--call-dock-floor,0px))]")
  })
})
