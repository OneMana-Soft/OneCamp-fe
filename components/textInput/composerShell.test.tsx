import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Provider } from "react-redux"
import { SendHorizontal } from "@/lib/icons"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"

// The conversation's composer (design v3 chat, C38, C39, C44, C45, C46): a
// floating card at e2 with the accent halo on focus, at most 800px; five tools
// on the left (+, Aa, emoji, @, Record), one microphone; the split Send whose
// chevron is Send later; asking an agent draws the agent edge and its hint.

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu", () => ({ LinkBubbleMenu: () => null }))
// Whether a dictation is going, as a test sets it.
const voice = vi.hoisted(() => ({ recording: false, stop: (() => {}) as () => void }))
vi.mock("@/hooks/useVoiceDictation", () => ({
  useVoiceDictation: () => ({ available: true, recording: voice.recording, transcribing: false, setup: { needed: false, sizeMb: null, progress: null }, start: vi.fn(), stop: voice.stop, toggle: vi.fn() }),
  dictationLabel: () => "Dictate",
}))
let kinds: Record<string, string> = {}
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => kinds, useBotKind: () => undefined }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined }), useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }) }))

const { default: store } = await import("@/store/store")
const { default: MinimalTiptapTextInput } = await import("./textInput")
const { sendLaterChoices } = await import("./composerTools")

afterEach(() => {
  cleanup()
  kinds = {}
})

const composer = (content = "", extra: Record<string, unknown> = {}) =>
  render(
    <Provider store={store}>
      <TooltipProvider>
        <MinimalTiptapTextInput
          variant="chat"
          throttleDelay={20}
          output="html"
          content={content}
          editable
          ButtonIcon={SendHorizontal}
          buttonOnclick={() => {}}
          attachmentOnclick={() => {}}
          onActionFiles={() => {}}
          onSchedule={() => true}
          {...extra}
        />
      </TooltipProvider>
    </Provider>,
  )

describe("the chat composer", () => {
  it("is a floating card at e2 with the focus halo, no bordered box, at most 800px", async () => {
    const { container } = composer()
    const card = await waitFor(() => container.querySelector<HTMLElement>("[data-composer]")!)
    expect(card.className).toContain("composer-card")
    expect(card.className).toContain("bg-raised")
    expect(card.className).toContain("rounded-xl")
    expect(card.className).toContain("max-w-[800px]")
    expect(card.className).not.toContain("border-input")
  })

  it("has five tools on the left and one microphone", async () => {
    const { container } = composer()
    await waitFor(() => screen.getByRole("button", { name: "Add to the message" }))
    for (const name of ["Add to the message", "Show formatting", "Mention someone", "Record"]) expect(screen.getByRole("button", { name })).toBeTruthy()
    expect(container.querySelectorAll("[data-icon=mic]")).toHaveLength(1)
    expect(screen.queryByRole("button", { name: "Write with AI" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Schedule message" })).toBeNull()
  })

  // QA F-41: a thread's reply box, the compact composer, had no @ and no
  // Record, which the list's composer has.
  it("gives a thread's compact box the same tools", async () => {
    const { container } = composer("", { compact: true })
    await waitFor(() => screen.getByRole("button", { name: "Add to the message" }))
    for (const name of ["Add to the message", "Show formatting", "Mention someone", "Record"]) expect(screen.getByRole("button", { name })).toBeTruthy()
    expect(container.querySelectorAll("[data-icon=mic]")).toHaveLength(1)
  })
  it("shows Send as the press overlay with no chevron when empty, the accent and its chevron when ready", async () => {
    composer()
    const send = await waitFor(() => screen.getByRole("button", { name: "Send" }))
    expect(send.className).toContain("bg-press")
    expect(send.className).not.toContain("shadow-primary")
    const chevron = document.querySelector<HTMLElement>('[aria-label="Send later"]')!
    expect(chevron.className).toContain("opacity-0")
    expect(chevron.tabIndex).toBe(-1)
    cleanup()
    composer("<p>Numbers are in</p>")
    await waitFor(() => expect(screen.getByRole("button", { name: "Send" }).className).toContain("bg-brand"))
    expect(screen.getByRole("button", { name: "Send later" }).getAttribute("aria-hidden")).toBeNull()
  })

  it("asks an agent: the agent edge and who will answer", async () => {
    kinds = { rc: "agent" }
    const { container } = composer('<p><span data-type="mention" data-id="rc@0x1" data-label="Release Captain">@Release Captain</span> status?</p>')
    await waitFor(() => expect(container.querySelector("[data-asking-agent]")).toBeTruthy())
    expect(container.querySelector("[data-asking-hint]")!.textContent).toContain("Release Captain will answer here · acts for you")
  })

  it("offers Draft with AI from + when the surface has it", async () => {
    const draft = vi.fn()
    composer("", { onDraftWithAI: draft })
    fireEvent.keyDown(await waitFor(() => screen.getByRole("button", { name: "Add to the message" })), { key: "Enter" })
    fireEvent.click(screen.getByRole("menuitem", { name: /Draft with AI/ }))
    expect(draft).toHaveBeenCalled()
  })
})

describe("send later's presets", () => {
  it("offers this evening only before 16:00, and Monday on a Friday or Saturday", () => {
    const morning = sendLaterChoices(new Date(2026, 9, 9, 10, 0)).map((c) => c.key) // Friday 10:00
    expect(morning).toEqual(["hour", "evening", "tomorrow", "monday"])
    const late = sendLaterChoices(new Date(2026, 9, 7, 17, 0)).map((c) => c.key) // Wednesday 17:00
    expect(late).toEqual(["hour", "tomorrow"])
    const sunday = sendLaterChoices(new Date(2026, 9, 11, 9, 0)).map((c) => c.key)
    expect(sunday).not.toContain("monday")
  })
})

// While a dictation goes, Esc in the box stops it (and drops what it heard).
// In a dialog, the dialog heard Esc first and closed, the dictation with it:
// the box says it answers Escape while it does (lib/keys/escapeOwn).
