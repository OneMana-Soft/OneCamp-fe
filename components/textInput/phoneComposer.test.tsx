import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { Provider } from "react-redux"
import { SendHorizontal } from "@/lib/icons"
import { TooltipProvider } from "@/components/ui/tooltip"

// The phone's composer (design v3 chat, C48): a floating card with one row at
// rest ("+", the field, the smile, Send), where an empty Send is Record and a
// ready one is the accent's arrow; no grab sheet at rest.
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

afterEach(cleanup)

const composer = (content = "") =>
  render(
    <Provider store={store}>
      <TooltipProvider>
        <MinimalTiptapTextInput
          variant="phone"
          throttleDelay={20}
          output="html"
          content={content}
          editable
          ButtonIcon={SendHorizontal}
          buttonOnclick={() => {}}
          attachmentOnclick={() => {}}
          onActionFiles={() => {}}
        />
      </TooltipProvider>
    </Provider>,
  )

/** The controls a thumb can reach: not hidden, not out of the tab order. */
const reachable = (root: Element) =>
  [...root.querySelectorAll("button")].filter((b) => !b.closest("[aria-hidden=true]") && b.getAttribute("aria-hidden") !== "true" && b.tabIndex !== -1)

describe("the phone composer", () => {
  // QA F-26: its tools were 36px, Send 36px and the smile 32px under a
  // finger. Every control in the card takes a finger's 44px (app/phone.css
  // F3), and a row of 36px tools sits 8px apart on a touch screen, so each
  // reach ends where the next one's starts (QA-FIX's e2e/touchTargets.spec
  // measures it on a phone).
  it("gives every control a finger's 44px, and spaces its rows for it on a touch screen", async () => {
    const { container } = composer("<p>Numbers are in</p>")
    const card = await waitFor(() => container.querySelector<HTMLElement>("[data-phone-composer]")!)
    fireEvent.focus(card.querySelector("[contenteditable]")!)
    const tools = await waitFor(() => card.querySelector<HTMLElement>("[data-phone-tools]")!)
    fireEvent.click(screen.getByRole("button", { name: "Show formatting" }))
    const buttons = [...card.querySelectorAll("button")]
    expect(buttons.length).toBeGreaterThan(8)
    for (const b of buttons) expect(b.hasAttribute("data-touch-target"), b.getAttribute("aria-label") ?? b.textContent ?? "").toBe(true)
    expect(tools.className.split(/\s+/)).toContain("pointer-coarse:gap-2")
    expect(screen.getByRole("button", { name: "Hide formatting" })).toBeTruthy()
    const formatRow = card.querySelector<HTMLElement>("[data-phone-tools] + div")!
    expect(formatRow.className.split(/\s+/)).toContain("pointer-coarse:gap-2")
  })

  it("is one row at rest: at most three controls beside the field, on a floating card", async () => {
    const { container } = composer()
    const card = await waitFor(() => container.querySelector<HTMLElement>("[data-phone-composer]")!)
    expect(card.className).toContain("rounded-2xl")
    expect(card.className).toContain("shadow-e2")
    expect(card.className).toContain("bg-raised")
    expect(reachable(card).length).toBeLessThanOrEqual(3)
    expect(container.querySelector("[data-phone-tools]")).toBeNull()
  })

  it("shows Record where Send goes while the field is empty", async () => {
    composer()
    const record = await waitFor(() => screen.getByRole("button", { name: "Record" }))
    expect(record.closest("[aria-hidden=true]")).toBeNull()
    expect(document.querySelector('[aria-label="Send"]')!.getAttribute("aria-hidden")).toBe("true")
  })

  it("turns Send into the accent's arrow with words", async () => {
    composer("<p>Numbers are in</p>")
    await waitFor(() => expect(document.querySelector('[aria-label="Send"]')!.getAttribute("aria-hidden")).toBeNull())
    const send = screen.getByRole("button", { name: "Send" })
    expect(send.className).toContain("bg-brand")
    expect(screen.getByRole("button", { name: "Record", hidden: true }).closest("[aria-hidden=true]")).not.toBeNull()
  })

  it("keeps clips and dictation in reach from +", () => {
    const src = readFileSync("components/textInput/phoneComposerShell.tsx", "utf8")
    expect(src).toMatch(/onRecordClip=\{onFiles \? \(\) => setClipOpen\(true\) : undefined\}/)
    expect(src).toMatch(/onDictate=\{dictation\.available \? dictation\.toggle : undefined\}/)
  })

  it("draws no grab sheet at rest", () => {
    const drawer = readFileSync("components/drawers/dragableDrawer.tsx", "utf8")
    expect(drawer).not.toContain("rounded-t-3xl")
    expect(drawer).toContain('isExpanded ? "bg-sheet" : "bg-[linear-gradient(to_top,var(--sheet)_calc(100%_-_32px),transparent)]"')
  })
})
