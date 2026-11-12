import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Provider } from "react-redux"
import { TooltipProvider } from "@/components/ui/tooltip"

// NO DEAD DRAFT WITH AI (UX-CHAT-H2, the audit's CHAT-18 part 0). The message
// box offered Draft with AI in "+", on the phone's tool strip and on ⌘J
// whatever the workspace's AI was: its popover gates itself (withAI) and draws
// nothing with AI off, so on the AI edition with AI switched off or no
// provider each of the three was a control that did nothing, and ⌘J was
// taken from the browser for it. With AI off the box offers none of them.

const config = vi.hoisted(() => ({ ai: false, phone: false }))
vi.mock("@/hooks/useClientConfig", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/hooks/useClientConfig")>()
  return {
    ...real,
    useAIAvailable: () => config.ai,
    useFeature: (name: string) => name === real.FEATURE_AI && config.ai,
    useClientConfig: () => ({ features: { [real.FEATURE_AI]: config.ai } }),
  }
})
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: config.phone, isDesktop: !config.phone }) }))
vi.mock("@/components/minimal-tiptap/components/bubble-menu/link-bubble-menu", () => ({ LinkBubbleMenu: () => null }))
vi.mock("@/hooks/useVoiceDictation", () => ({
  useVoiceDictation: () => ({ available: true, recording: false, transcribing: false, setup: { needed: false, sizeMb: null, progress: null }, start: vi.fn(), stop: vi.fn(), toggle: vi.fn() }),
  dictationLabel: () => "Dictate",
}))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => ({}), useBotKind: () => undefined }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined }), useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }) }))
vi.mock("@/hooks/usePublishTyping", () => ({ usePublishTyping: () => ({ publishTyping: () => {} }) }))
vi.mock("@/hooks/useUploadFile", () => ({ useUploadFile: () => ({ validateFiles: () => [], makeRequestToUploadToConversation: async () => {} }) }))
vi.mock("@/components/command/LazyCommandSurface", () => ({ LazyCommandSurface: () => null }))
// The popover itself (its own gate is withAI); here only whether the box asked for it.
vi.mock("@/components/ai/ComposerAIButton", () => ({ ComposerAIButton: ({ open }: { open: boolean }) => (open ? <div data-testid="draft-with-ai" /> : null) }))

const { default: store } = await import("@/store/store")
const { ComposerHost } = await import("@/components/conversation/ComposerHost")
const { Composer } = await import("@/components/conversation/Composer")

afterEach(() => {
  cleanup()
  config.ai = false
  config.phone = false
})

function box({ ai, phone }: { ai: boolean; phone: boolean }) {
  config.ai = ai
  config.phone = phone
  return render(
    <Provider store={store}>
      <TooltipProvider>
        <ComposerHost target={{ kind: "channel", id: "c1" }}>
          <Composer handleSend={() => true} placeholder="Message #launch" phone={phone} />
        </ComposerHost>
      </TooltipProvider>
    </Provider>,
  )
}

async function plusMenuItems() {
  fireEvent.keyDown(await waitFor(() => screen.getAllByRole("button", { name: "Add to the message" })[0]), { key: "Enter" })
  return (await screen.findAllByRole("menuitem")).map((i) => i.textContent ?? "")
}

/** ⌘J (Ctrl+J off a Mac) in the box: whether the box took it from the browser. */
async function modJTaken(container: HTMLElement) {
  const field = await waitFor(() => container.querySelector<HTMLElement>("[contenteditable]")!)
  const key = new KeyboardEvent("keydown", { key: "j", ctrlKey: true, bubbles: true, cancelable: true })
  field.dispatchEvent(key)
  return key.defaultPrevented
}

describe("Draft with AI in the message box", () => {
  it("with AI off there is no Draft with AI in '+', on the phone strip or on ⌘J", async () => {
    const desk = box({ ai: false, phone: false })
    const items = await plusMenuItems()
    expect(items.some((t) => t.includes("Create a task"))).toBe(true)
    expect(items.some((t) => t.includes("Draft with AI"))).toBe(false)
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    expect(await modJTaken(desk.container)).toBe(false)
    expect(screen.queryByTestId("draft-with-ai")).toBeNull()
    cleanup()

    const phone = box({ ai: false, phone: true })
    const field = await waitFor(() => phone.container.querySelector<HTMLElement>("[data-phone-composer] [contenteditable]")!)
    fireEvent.focus(field)
    await waitFor(() => expect(phone.container.querySelector("[data-phone-tools]")).toBeTruthy())
    expect(screen.queryByRole("button", { name: "Mention someone" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Draft with AI" })).toBeNull()
    const phoneItems = await plusMenuItems()
    expect(phoneItems.some((t) => t.includes("Draft with AI"))).toBe(false)
  })

  it("with AI on, '+', the phone strip and ⌘J each open it", async () => {
    const desk = box({ ai: true, phone: false })
    expect((await plusMenuItems()).some((t) => t.includes("Draft with AI"))).toBe(true)
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    expect(await modJTaken(desk.container)).toBe(true)
    await waitFor(() => expect(screen.getByTestId("draft-with-ai")).toBeTruthy())
    cleanup()

    const phone = box({ ai: true, phone: true })
    const field = await waitFor(() => phone.container.querySelector<HTMLElement>("[data-phone-composer] [contenteditable]")!)
    fireEvent.focus(field)
    fireEvent.click(await screen.findByRole("button", { name: "Draft with AI" }))
    await waitFor(() => expect(screen.getByTestId("draft-with-ai")).toBeTruthy())
  })
})
