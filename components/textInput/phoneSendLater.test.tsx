import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { Provider } from "react-redux"
import { SendHorizontal } from "@/lib/icons"
import { TooltipProvider } from "@/components/ui/tooltip"
import { pinTestClock } from "@/lib/testing/testClock"
import { installRangeRects } from "@/lib/testing/rangeRects"
import { sendLaterChoices } from "./composerTools"
import type { ChipSchedule } from "./useUndoSchedule"

// V-711: on a phone the message box had no Send later at all (Send had no
// menu and no long-press, "+" had none), where a computer's Send offers it.
// The phone's Send later is the computer's: its choices, its time field and
// its schedule call, as a sheet, from a long-press on Send or from "+".
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: true, isDesktop: false }) }))
vi.mock("@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu", () => ({ LinkBubbleMenu: () => null }))
vi.mock("@/hooks/useVoiceDictation", () => ({
  useVoiceDictation: () => ({ available: true, recording: false, transcribing: false, setup: { needed: false, sizeMb: null, progress: null }, start: vi.fn(), stop: vi.fn(), toggle: vi.fn() }),
  dictationLabel: () => "Dictate",
}))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => ({}), useBotKind: () => undefined }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined }), useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }) }))

const { default: store } = await import("@/store/store")
const { default: MinimalTiptapTextInput } = await import("./textInput")

const LOAD = { timeout: 8000 }
// Thursday 15 Oct 2026, 10:00 on this machine's clock.
const NOW = new Date(2026, 9, 15, 10, 0)
pinTestClock(NOW)
afterEach(cleanup)
// The box takes the focus back as the sheet closes, and ProseMirror then scrolls to its caret.
let restoreRects = () => {}
beforeAll(() => {
  restoreRects = installRangeRects()
})
afterAll(() => restoreRects())

function composer(content: string, onSchedule: (html: string | undefined, at: Date) => unknown = vi.fn(async () => true), chipSchedule?: ChipSchedule) {
  const onSend = vi.fn()
  const box = (here?: ChipSchedule) => (
    <Provider store={store}>
      <TooltipProvider>
        <MinimalTiptapTextInput
          variant="phone"
          throttleDelay={20}
          output="html"
          content={content}
          editable
          ButtonIcon={SendHorizontal}
          buttonOnclick={onSend}
          onSchedule={onSchedule}
          chipSchedule={here}
          attachmentOnclick={() => {}}
          onActionFiles={() => {}}
        />
      </TooltipProvider>
    </Provider>
  )
  const { rerender } = render(box(chipSchedule))
  return { onSend, onSchedule, redraw: (here: ChipSchedule) => rerender(box(here)) }
}

const sendLaterSheet = () => screen.findByRole("menu", { name: "Send later" }, LOAD)
const fromPlus = async () => {
  fireEvent.keyDown(await screen.findByRole("button", { name: "Add to the message" }, LOAD), { key: "Enter" })
  return screen.findByRole("menuitem", { name: /Send later/ }, LOAD)
}
const finger = { touches: [{ clientX: 200, clientY: 700 }] }
const hold = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe("the phone composer's Send later (V-711)", () => {
  it("is in +, and opens the computer's choices; a choice schedules what is in the box", { timeout: 20000 }, async () => {
    const { onSchedule } = composer("<p>The launch note is attached.</p>")
    fireEvent.click(await fromPlus())
    const sheet = await sendLaterSheet()
    const rows = within(sheet).getAllByRole("menuitem").map((r) => r.textContent ?? "")
    for (const c of sendLaterChoices(NOW)) expect(rows.some((r) => r.startsWith(c.label))).toBe(true)
    expect(rows.some((r) => /Custom time/.test(r))).toBe(true)
    fireEvent.click(within(sheet).getByRole("menuitem", { name: /Tomorrow morning/ }))
    await waitFor(() => expect(onSchedule).toHaveBeenCalledWith(expect.stringContaining("The launch note is attached."), new Date(2026, 9, 16, 9, 0)))
    // The computer's chip, with what it says, once the schedule went.
    expect(await screen.findByText(/Scheduled for/)).toBeTruthy()
  })

  it("opens from a long-press on Send, and a tap on Send still sends", { timeout: 20000 }, async () => {
    const { onSend } = composer("<p>The launch note is attached.</p>")
    await waitFor(() => expect(document.querySelector('[aria-label="Send"]')!.getAttribute("aria-hidden")).toBeNull())
    const send = screen.getByRole("button", { name: "Send" })
    // A tap: no sheet, the message goes.
    fireEvent.touchStart(send, finger)
    fireEvent.touchEnd(send)
    fireEvent.click(send)
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole("menu")).toBeNull()
    // A hold: the sheet, and its release sends nothing.
    fireEvent.touchStart(send, finger)
    await hold(650)
    const sheet = await sendLaterSheet()
    fireEvent.touchEnd(send)
    fireEvent.click(send, { detail: 1 })
    expect(onSend).toHaveBeenCalledTimes(1)
    expect(within(sheet).getByRole("menuitem", { name: /In 1 hour/ })).toBeTruthy()
  })

  it("takes Custom time… as the computer does: the app's date and time fields, two hours ahead", { timeout: 20000 }, async () => {
    const { onSchedule } = composer("<p>The launch note is attached.</p>")
    fireEvent.click(await fromPlus())
    fireEvent.click(within(await sendLaterSheet()).getByRole("menuitem", { name: /Custom time/ }))
    const group = await screen.findByRole("group", { name: "Pick a date and time" }, LOAD)
    expect(within(group).getByRole("button", { name: /^Time/ })).toHaveTextContent("12:00 PM")
    fireEvent.click(screen.getByRole("button", { name: "Schedule" }))
    await waitFor(() => expect(onSchedule).toHaveBeenCalledWith(expect.any(String), new Date(2026, 9, 15, 12, 0)))
  })

  it("is off with nothing to send, as Send is", { timeout: 20000 }, async () => {
    composer("")
    expect((await fromPlus()).getAttribute("aria-disabled")).toBe("true")
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    const send = document.querySelector<HTMLElement>('[aria-label="Send"]')!
    fireEvent.touchStart(send, finger)
    await hold(650)
    fireEvent.touchEnd(send)
    expect(screen.queryByRole("menu", { name: "Send later" })).toBeNull()
    // The hold's release click, which a finger can't make here (Send takes no
    // pointer while hidden): it goes, so the next test's first click is its own.
    fireEvent.click(document.body, { detail: 1 })
  })

  it("drops its chip once the message leaves the scheduled list (deleted there, or sent)", { timeout: 20000 }, async () => {
    const queue = (listed: boolean): ChipSchedule => ({ undo: vi.fn(), queued: () => listed })
    const { redraw } = composer("<p>The launch note is attached.</p>", undefined, queue(false))
    fireEvent.click(await fromPlus())
    fireEvent.click(within(await sendLaterSheet()).getByRole("menuitem", { name: /Tomorrow morning/ }))
    expect(await screen.findByText(/Scheduled for/)).toBeTruthy()
    redraw(queue(true))
    expect(screen.getByText(/Scheduled for/)).toBeTruthy()
    redraw(queue(false))
    await waitFor(() => expect(screen.queryByText(/Scheduled for/)).toBeNull())
  })

  // CR-B44 F3: "+" hands its row's sheet over, giving the focus back to no
  // one; its trigger took it from the sheet, which closed on that.
  it("stays open, the focus in it, when + hands it over", { timeout: 20000 }, async () => {
    composer("<p>The launch note is attached.</p>")
    fireEvent.click(await fromPlus())
    const sheet = await sendLaterSheet()
    await hold(100)
    expect(sheet.isConnected).toBe(true)
    expect(sheet.contains(document.activeElement)).toBe(true)
  })

  // CR-B44's note: the sheet rises from an anchor that takes no focus, so
  // closing it left the focus on the page.
  it("gives the focus back to Send as it closes, or to the box once a time went", { timeout: 20000 }, async () => {
    composer("<p>The launch note is attached.</p>")
    fireEvent.click(await fromPlus())
    fireEvent.keyDown(await sendLaterSheet(), { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Send" })))
    fireEvent.click(await fromPlus())
    fireEvent.click(within(await sendLaterSheet()).getByRole("menuitem", { name: /In 1 hour/ }))
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector("[contenteditable]")))
  })

  it("leaves no chip when the schedule failed (the box keeps the words; the request says why)", { timeout: 20000 }, async () => {
    const { onSchedule } = composer("<p>The launch note is attached.</p>", vi.fn(async () => false))
    fireEvent.click(await fromPlus())
    fireEvent.click(within(await sendLaterSheet()).getByRole("menuitem", { name: /In 1 hour/ }))
    await waitFor(() => expect(onSchedule).toHaveBeenCalled())
    await hold(50)
    expect(screen.queryByText(/Scheduled for/)).toBeNull()
    expect(document.querySelector("[contenteditable]")!.textContent).toContain("The launch note is attached.")
  })
})

describe("the phone's Send later sheet", () => {
  it("pins Custom time's Schedule in the sheet's footer, under the one scroller", { timeout: 20000 }, async () => {
    const real = window.matchMedia
    window.matchMedia = ((q: string) => ({ matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia
    try {
      composer("<p>The launch note is attached.</p>")
      fireEvent.click(await fromPlus())
      fireEvent.click(within(await sendLaterSheet()).getByRole("menuitem", { name: /Custom time/ }))
      const group = await screen.findByRole("group", { name: "Pick a date and time" }, LOAD)
      const sheet = screen.getByRole("menu", { name: "Send later" })
      expect(sheet.hasAttribute("data-overlay-holds-body")).toBe(true)
      expect(sheet.hasAttribute("data-overlay-holds-footer")).toBe(true)
      expect(group.closest("[data-overlay-body]")).not.toBeNull()
      expect(screen.getByRole("button", { name: "Schedule" }).closest("[data-overlay-footer]")).not.toBeNull()
    } finally {
      window.matchMedia = real
    }
  })
})
