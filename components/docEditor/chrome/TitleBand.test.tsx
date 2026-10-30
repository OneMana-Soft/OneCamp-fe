import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import * as React from "react"
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"

const hoisted = vi.hoisted(() => ({ set: vi.fn(), mobile: false }))

vi.mock("@/services/docChromeService", () => ({ setDocLook: hoisted.set }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: hoisted.mobile, isTablet: false, isDesktop: !hoisted.mobile }) }))
vi.mock("../Breadcrumbs", () => ({ PathLine: () => <nav aria-label="Pages above this doc" /> }))
vi.mock("../DocCover", () => ({ DocCover: () => <div data-doc-cover-controls="" />, CoverPicker: () => null, GALLERY: [{ name: "sky" }, { name: "lake" }, { name: "moss" }, { name: "sun" }, { name: "berry" }, { name: "dusk" }] }))
vi.mock("../DocIconPicker", () => ({ DocIconPicker: () => <div data-doc-icon-picker="" /> }))

import TitleBand from "./TitleBand"
import { SCREENS, putOnScreen } from "@/lib/testing/screens"
import { createTitleStore } from "../docTitleStore"
import { setFacts } from "./pageFacts"
import { registerSlot } from "../registry/registry"

registerSlot({ slot: "titleChips", id: "test.suggestions", edition: "both", load: async () => ({ default: () => <button type="button">2 suggestions</button> }) })

const editors: Editor[] = []
beforeEach(() => {
  hoisted.set.mockReset().mockResolvedValue(undefined)
  hoisted.mobile = false
})
afterEach(() => {
  cleanup()
  editors.splice(0).forEach((e) => e.destroy())
})

function Band({ title = "", body = "<p></p>", doc = {}, editable = true, docId = "tb1", icon }: { title?: string; body?: string; doc?: Record<string, unknown>; editable?: boolean; docId?: string; icon?: string }) {
  const [store] = React.useState(() => createTitleStore(title))
  const [editor] = React.useState(() => {
    const e = new Editor({ extensions: [StarterKit], content: body, element: document.createElement("div") })
    editors.push(e)
    return e
  })
  const titleRef = React.useRef<HTMLTextAreaElement>(null)
  const onTitle = (t: string) => store.set(t)
  return (
    <div data-doc-title-block="">
      {/* The page's icon, as DocTitle draws it: the icon picker's way in. */}
      {icon ? <span data-doc-page-icon="">{icon}</span> : null}
      <div className="relative">
        <TitleBand docId={docId} doc={doc as never} editable={editable} editor={editor} store={store} titleRef={titleRef} onTitle={onTitle} padded="px-5" />
      </div>
      <textarea ref={titleRef} aria-label="Title" defaultValue={title} />
    </div>
  )
}

describe("the title band (D-2, T4)", () => {
  it("adds the icon the title suggests, and a gallery cover", async () => {
    render(<Band title="Launch checklist" />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add icon" })))
    expect(hoisted.set).toHaveBeenCalledWith({ doc_uuid: "tb1", icon: "🚀" })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add cover" })))
    expect(hoisted.set).toHaveBeenLastCalledWith({ doc_uuid: "tb1", cover: expect.stringMatching(/^gallery:/), cover_offset: 50 })
  })

  it("offers nothing to change for a reader, nor while a soft lock holds the page", () => {
    const view = render(<Band editable={false} />)
    expect(screen.queryByRole("button", { name: "Add icon" })).toBeNull()
    view.unmount()
    setFacts("tb2", { lock: "soft" })
    render(<Band docId="tb2" />)
    expect(screen.queryByRole("button", { name: "Add icon" })).toBeNull()
    // The title is held as the body is, and let go with Unlock for me.
    const title = screen.getByRole("textbox", { name: "Title" }) as HTMLTextAreaElement
    expect(title.readOnly).toBe(true)
    act(() => setFacts("tb2", { unlockedForMe: true }))
    expect(title.readOnly).toBe(false)
  })

  it("suggests the body's first line for an empty title, and takes it with Tab", async () => {
    render(<Band body="<p>Launch checklist</p><p>Ship it</p>" />)
    const title = screen.getByRole("textbox", { name: "Title" }) as HTMLTextAreaElement
    act(() => title.focus())
    expect((await screen.findByText(/to use “Launch checklist”/)).closest("[data-doc-title-suggestion]")).not.toBeNull()
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
    act(() => {
      title.dispatchEvent(tab)
    })
    expect(tab.defaultPrevented).toBe(true)
    expect(screen.queryByText(/to use “Launch checklist”/)).toBeNull()
  })

  it("lets Tab leave a title that has words in it", () => {
    render(<Band title="Plan" body="<p>Launch checklist</p>" />)
    const title = screen.getByRole("textbox", { name: "Title" })
    act(() => title.focus())
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
    title.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(false)
  })

  it("shows a phone the path above the doc and the header's title chips, with the icon and cover as buttons", async () => {
    hoisted.mobile = true
    render(<Band docId="tb3" />)
    expect(screen.getByRole("navigation", { name: "Pages above this doc" })).toBeTruthy()
    // The chips the header draws on a computer (the lock, the suggestions waiting): a phone has no header.
    expect(await screen.findByRole("button", { name: "2 suggestions" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Add an icon" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Add a cover" })).toBeTruthy()
  })

  it("leaves the title chips to the header on a computer", async () => {
    render(<Band docId="tb6" />)
    await act(async () => {})
    expect(screen.queryByRole("button", { name: "2 suggestions" })).toBeNull()
  })
})

// Step 3, part 2: Add icon and Add cover by touch. A finger's 44 px reach
// (app/phone.css F3) ran 6 px past each 32 px button, so with 4 px between
// them a tap at the near edge of Add an icon went to Add a cover. The band
// is a touch group, as every row of small controls is (app/phone.css F3b).
describe("the title band under a finger", () => {
  it("stands a phone's Add an icon and Add a cover apart, as a group of 32 px controls", () => {
    hoisted.mobile = true
    render(<Band docId="tb4" />)
    const row = screen.getByRole("button", { name: "Add an icon" }).closest("[data-doc-band]")
    expect(row?.getAttribute("data-touch-group")).toBe("32")
    expect(row?.contains(screen.getByRole("button", { name: "Add a cover" }))).toBe(true)
  })

  it("does the same for a tablet's Add icon and Add cover, 28 px tall", () => {
    render(<Band docId="tb5" />)
    const row = screen.getByRole("button", { name: "Add icon" }).closest("[data-doc-band]")
    expect(row?.getAttribute("data-touch-group")).toBe("")
  })
})

// ONE SHEET RULE (20 Oct 2026): a phone held sideways is 844px wide, so
// isMobile said no and the icon's picker came as a popover by the icon, and
// Add cover put a random cover on. Its pickers are sheets by useSheetMode;
// isMobile still lays out the band (its words, not the phone's icons).
describe("the title band on a phone held sideways", () => {
  let off = () => {}
  afterEach(() => {
    off()
    off = () => {}
  })

  it("opens the icon's picker as a sheet, and Add cover opens the covers in one", async () => {
    off = putOnScreen(SCREENS["a phone in landscape"])
    render(<Band docId="tb6" doc={{ doc_icon: "📐" }} icon="📐" />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Change the icon" })))
    expect(document.querySelector("[data-v3-sheet] [data-doc-icon-picker]")).toBeTruthy()
    expect(screen.getByText("Choose an icon")).toBeTruthy()
    cleanup()
    render(<Band docId="tb7" />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add cover" })))
    expect(hoisted.set).not.toHaveBeenCalled()
    expect(document.querySelector("[data-v3-sheet]")).toBeTruthy()
    expect(screen.getByText("Choose a cover")).toBeTruthy()
  })
})
