import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import React from "react"

// The AI panel's frame, as the final visual check left it (10 Oct): one header
// row that fits a 380px panel and a phone, nothing dead on the page, a reading
// column, and the accent kept for the one action.

let mobile = false
vi.mock("react-redux", () => ({
  useDispatch: () => vi.fn(),
  useSelector: (pick: (s: unknown) => unknown) => pick({ rightPanel: { rightPanelState: { data: { aiContextType: "" } } } }),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: mobile }) }))
vi.mock("@/components/common/withFeature", () => ({ withAI: <P extends object>(C: React.ComponentType<P>) => C }))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me-1" } } }) }))
vi.mock("@/hooks/useVoiceDictation", () => ({
  useVoiceDictation: () => ({ available: false, recording: false, transcribing: false, toggle: vi.fn(), setup: { progress: null } }),
  dictationLabel: () => "Dictate",
}))
const none = () => null
vi.mock("@/components/ai/MarkdownMessage", () => ({ default: ({ content }: { content: string }) => <div>{content}</div> }))
vi.mock("@/components/ai/ActionConfirmation", () => ({ default: none }))
// Stand-ins that say where they were drawn.
vi.mock("@/components/ai/AiModelPicker", () => ({ default: () => <span data-testid="model">Workspace model</span> }))
vi.mock("@/components/ai/AiUsageIndicator", () => ({ default: () => <span data-testid="usage">670 today</span> }))
vi.mock("@/components/ai/ReleaseNotesDialog", () => ({ default: none }))
vi.mock("@/components/ai/AiInstructionsDialog", () => ({ default: none }))
vi.mock("@/components/ai/MyAgentWorkDialog", () => ({ default: none }))
vi.mock("@/components/ai/SocialComposeDialog", () => ({ default: none }))
vi.mock("@/components/ai/AiScheduleDialog", () => ({ default: none }))
vi.mock("@/components/ai/AgentTeammatesMenuItem", () => ({ AgentTeammatesMenuItem: none }))
vi.mock("@/components/ai/ChatHistoryMenu", () => ({ ChatHistoryMenu: none }))
vi.mock("@/services/memoryService", () => ({ getAttention: vi.fn().mockResolvedValue({ enabled: true, items: [], counts: {} }) }))
vi.mock("@/lib/ai/lastConversation", () => ({
  readLastConversation: () => "s1",
  rememberConversation: vi.fn(),
  forgetConversation: vi.fn(),
}))
vi.mock("@/services/aiService", async (orig) => ({
  ...(await orig<typeof import("@/services/aiService")>()),
  getChatSessionState: vi.fn().mockResolvedValue({
    messages: [
      { role: "user", content: "Who owns the launch announcement?", created_at: "2026-10-10T10:00:00Z" },
      { role: "assistant", content: "Sam Rivera.", created_at: "2026-10-10T10:00:05Z" },
    ],
    live: false,
  }),
}))

if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {}

const { default: AiChatPanel } = await import("@/components/ai/AiChatPanel")

afterEach(() => {
  cleanup()
  mobile = false
})

describe("the AI panel's frame (hub.md AI1, AI2, AI4, AI5, AI10)", () => {
  it("keeps a 52px header of the agent-square mark, the name and the model, never a dusk tile", () => {
    render(<AiChatPanel />)
    const title = screen.getByRole("heading", { name: "OneCamp AI", level: 2 })
    expect(title.className).toContain("truncate")
    const header = title.closest("[data-ai-header]")!
    expect(header.className).toContain("h-[52px]")
    expect(header.querySelector("[data-ai-mark]")?.className).toContain("rounded-[32%]")
    expect(header.querySelector("[data-ai-mark]")?.className).toContain("avatar-agent")
    expect(header.innerHTML).not.toMatch(/dusk/)
    // The model chip moved up into the header; today's usage into the More menu.
    expect(header.querySelector('[data-testid="model"]')).toBeTruthy()
    expect(screen.queryByTestId("usage")).toBeNull()
    expect(screen.getByRole("button", { name: "Close panel" })).toBeTruthy()
  })

  it("on the computer's page, has nothing to close and keeps a 720px column", async () => {
    render(<AiChatPanel variant="page" />)
    expect(screen.queryByRole("button", { name: "Close panel" })).toBeNull()
    await screen.findByText("Sam Rivera.")
    const box = screen.getByRole("textbox", { name: "Message AI assistant" })
    expect(box.closest(".max-w-\\[720px\\]")).not.toBeNull()
  })

  it("on a phone's page, leaves its name to the top bar and keeps a way back", () => {
    mobile = true
    render(<AiChatPanel variant="page" />)
    expect(screen.queryByRole("heading", { name: "OneCamp AI", level: 2 })).toBeNull()
    expect(screen.getByRole("button", { name: "Close panel" })).toBeTruthy()
  })

  it("puts your words in a neutral bubble and the answer flat beside the mark", async () => {
    const { container } = render(<AiChatPanel />)
    const yours = (await screen.findByText("Who owns the launch announcement?")).parentElement!
    expect(yours.className).not.toMatch(/bg-hue|bg-primary|bg-brand/)
    expect(yours.className).toContain("ai-user-bubble")
    const answer = container.querySelector('[data-message="assistant"]')!
    expect(answer.className).not.toMatch(/\bbg-|border/)
    expect(answer.querySelector("[data-ai-mark]")).toBeTruthy()
    // The action row is always there on the last answer.
    expect(answer.querySelector("[data-action-row]")?.className).toContain("opacity-100")
    expect(screen.getByRole("button", { name: "Copy answer" })).toBeTruthy()
  })

  it("keeps the accent off the composer at rest: the halo is focus-only, an empty Send is press-grey", () => {
    const { container } = render(<AiChatPanel />)
    const card = container.querySelector("[data-ai-composer]")!
    const classes = card.className.split(/\s+/)
    for (const c of classes.filter((c) => c.includes("brand"))) expect(c.startsWith("focus-within:")).toBe(true)
    expect(card.className).toContain("ai-composer")
    // ai.css: r16 at e2, and the brand halo only under :focus-within.
    const css = readFileSync(resolve(__dirname, "ai.css"), "utf8")
    const rest = css.slice(css.indexOf(".ai-composer {"), css.indexOf("}", css.indexOf(".ai-composer {")))
    expect(rest).toMatch(/border-radius: 16px/)
    expect(rest).toMatch(/box-shadow: var\(--e2\);/)
    expect(rest).not.toMatch(/brand/)
    expect(css).toMatch(/\.ai-composer:focus-within \{[^}]*--brand/)
    const send = screen.getByRole("button", { name: "Send message" })
    expect(send.hasAttribute("disabled")).toBe(true)
    expect(send.className).toContain("bg-press")
    expect(send.className).not.toContain("bg-brand")
  })

  it("has no spinner anywhere in the AI", () => {
    for (const f of ["AiChatPanel.tsx", "AiComposer.tsx", "StreamingText.tsx", "AiEmpty.tsx", "ActionConfirmation.tsx"]) {
      expect(readFileSync(resolve(__dirname, f), "utf8")).not.toMatch(/Loader2|animate-spin/)
    }
  })

  it("keeps quiet lines at full muted contrast", () => {
    const src = readFileSync(resolve(__dirname, "AiChatPanel.tsx"), "utf8")
    expect(src).not.toMatch(/bg-primary\/10 text-primary/)
    expect(src).not.toMatch(/(?<!placeholder:)text-muted-foreground\/(60|70|80)/)
    expect(src).not.toMatch(/text-primary\/70|uppercase tracking-wide/)
    expect(src).not.toMatch(/Workspace Memory/)
  })
})

describe("the empty page (hub.md AI2)", () => {
  it("centres the composition and a wider composer together, with the suggestions under it", async () => {
    const { getChatSessionState } = await import("@/services/aiService")
    vi.mocked(getChatSessionState).mockRejectedValueOnce(new Error("gone"))
    const { container } = render(<AiChatPanel variant="page" />)
    const empty = container.querySelector("[data-ai-empty]")!
    const composer = empty.querySelector("[data-ai-composer]")!
    expect(composer.className).toContain("min-h-[88px]")
    const first = empty.querySelector("[data-suggestion]")!
    expect(composer.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // The glide to the bottom is by transform only.
    const src = readFileSync(resolve(__dirname, "AiChatPanel.tsx"), "utf8")
    const glide = src.slice(src.indexOf("The page's glide"), src.indexOf("Focus input on mount"))
    expect(glide).toMatch(/translateY/)
    expect(glide).not.toMatch(/height|top:|margin/)
  })
})
