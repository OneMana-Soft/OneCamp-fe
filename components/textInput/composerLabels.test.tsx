import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { Provider } from "react-redux"
import { SendHorizontal } from "@/lib/icons"
import { TooltipProvider } from "@/components/ui/tooltip"

// The composer's small words. Send later's "Tomorrow morning" read
// "Tomorrow morning · Tomorrow · 9:00 AM" and wrapped onto two lines; the "+"
// menu and the AI draft printed ⌘ on Linux and Windows, where the search pill
// beside them rightly says Ctrl K.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu", () => ({ LinkBubbleMenu: () => null }))
vi.mock("@/hooks/useVoiceDictation", () => ({
  useVoiceDictation: () => ({ available: false, recording: false, transcribing: false, setup: { needed: false, sizeMb: null, progress: null }, start: vi.fn(), stop: vi.fn(), toggle: vi.fn() }),
  dictationLabel: () => "Dictate",
}))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => ({}), useBotKind: () => undefined }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined }), useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }) }))

const { default: store } = await import("@/store/store")
const { default: MinimalTiptapTextInput } = await import("./textInput")
const { laterTimeLabel, sendLaterChoices, ScheduledChip } = await import("./composerTools")
const { clockTime } = await import("@/lib/utils/date/clock")

afterEach(cleanup)

describe("Send later's times", () => {
  const friday = new Date(2026, 9, 9, 10, 0) // a Friday morning

  it("name only the time when the preset already names the day", () => {
    for (const c of sendLaterChoices(friday).filter((c) => c.key !== "hour")) {
      expect(laterTimeLabel(c, friday)).toBe(clockTime(c.at))
      expect(laterTimeLabel(c, friday)).not.toMatch(/Tomorrow|Mon/)
    }
  })

  it("say the day for 'In 1 hour' when that hour is tomorrow", () => {
    const late = new Date(2026, 9, 9, 23, 30)
    const hour = sendLaterChoices(late).find((c) => c.key === "hour")!
    expect(laterTimeLabel(hour, late)).toMatch(/^Tomorrow · /)
    const hourToday = sendLaterChoices(friday).find((c) => c.key === "hour")!
    expect(laterTimeLabel(hourToday, friday)).toBe(clockTime(hourToday.at))
  })
})

describe("shortcut labels", () => {
  it("say Ctrl off a Mac in the + menu", async () => {
    render(
      <Provider store={store}>
        <TooltipProvider>
          <MinimalTiptapTextInput variant="chat" output="html" content="" editable ButtonIcon={SendHorizontal} buttonOnclick={() => {}} onDraftWithAI={() => {}} />
        </TooltipProvider>
      </Provider>,
    )
    fireEvent.keyDown(await waitFor(() => screen.getByRole("button", { name: "Add to the message" })), { key: "Enter" })
    const item = screen.getByRole("menuitem", { name: /Draft with AI/ })
    expect(item.textContent).toContain("Ctrl+J")
    expect(item.textContent).not.toContain("⌘")
  })

  it("never hard-code the Mac's ⌘ in the composer", () => {
    for (const f of ["components/textInput/composerTools.tsx", "components/textInput/chatComposerShell.tsx"]) {
      const src = readFileSync(f, "utf8").replace(/\/\/.*$|\/\*[\s\S]*?\*\/|^\s*\*.*$/gm, "")
      expect(src, f).not.toMatch(/>⌘J<|<kbd className="kbd">⌘<\/kbd>/)
    }
  })
})

describe("the composer's tools", () => {
  // They wore the browser's own title tooltip, an OS box a second late, unlike
  // every other label in a conversation (the hover toolbar's data-tip, the
  // header's tooltips). They use the conversation's label, above the row.
  it("label themselves as the rest of a conversation does, never with title", async () => {
    render(
      <Provider store={store}>
        <TooltipProvider>
          <MinimalTiptapTextInput variant="chat" output="html" content="" editable ButtonIcon={SendHorizontal} buttonOnclick={() => {}} attachmentOnclick={() => {}} onActionFiles={() => {}} />
        </TooltipProvider>
      </Provider>,
    )
    await waitFor(() => screen.getByRole("button", { name: "Add to the message" }))
    for (const name of ["Add to the message", "Show formatting", "Mention someone", "Record", "Send"]) {
      const b = screen.getByRole("button", { name })
      expect(b.getAttribute("title"), name).toBeNull()
      expect(b.getAttribute("data-tip"), name).toBeTruthy()
      expect(b.className, name).toContain("after:bottom-full")
    }
  })
})

// The chip said "Scheduled for Tomorrow 09:00" while the toast said "Scheduled
// for tomorrow at 09:00" (QA F-39): one way of saying when.
describe("the scheduled chip", () => {
  it("says when in the toast's words", () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(9, 0, 0, 0)
    render(<ScheduledChip at={tomorrow} onDone={() => {}} />)
    expect(document.querySelector("[data-scheduled-chip]")!.textContent).toBe(`Scheduled for tomorrow at ${clockTime(tomorrow)}`)
  })
})
