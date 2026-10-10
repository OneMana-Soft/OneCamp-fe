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
vi.mock("@/components/ai/AiModelPicker", () => ({ default: () => <span data-testid="model">Workspace default</span> }))
vi.mock("@/components/ai/AiUsageIndicator", () => ({ default: () => <span data-testid="usage">670 today</span> }))
vi.mock("@/components/ai/ReleaseNotesDialog", () => ({ default: none }))
vi.mock("@/components/ai/AiInstructionsDialog", () => ({ default: none }))
vi.mock("@/components/ai/MyAgentWorkDialog", () => ({ default: none }))
vi.mock("@/components/ai/SocialComposeDialog", () => ({ default: none }))
vi.mock("@/components/ai/AiScheduleDialog", () => ({ default: none }))
vi.mock("@/components/ai/AgentTeammatesMenuItem", () => ({ AgentTeammatesMenuItem: none }))
vi.mock("@/components/ai/ChatHistoryMenu", () => ({ ChatHistoryMenu: none }))
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

describe("the AI panel's frame", () => {
  it("keeps its header to one row, and the model and today's usage under the box", async () => {
    render(<AiChatPanel />)
    const title = screen.getByRole("heading", { name: "OneCamp AI", level: 2 })
    // One line that gives way, never a second one.
    expect(title.className).toContain("truncate")
    const header = title.parentElement!
    expect(header.className).toContain("h-12")
    expect(header.querySelector('[data-testid="model"]')).toBeNull()
    expect(header.querySelector('[data-testid="usage"]')).toBeNull()
    // Under the message box, in the same footer.
    const box = screen.getByRole("textbox", { name: "Message AI assistant" })
    const footer = screen.getByTestId("model").parentElement!
    expect(footer.contains(screen.getByTestId("usage"))).toBe(true)
    expect(box.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole("button", { name: "Close panel" })).toBeTruthy()
  })

  it("on the computer's page, has nothing to close and keeps a reading column", () => {
    render(<AiChatPanel variant="page" />)
    expect(screen.queryByRole("button", { name: "Close panel" })).toBeNull()
    const box = screen.getByRole("textbox", { name: "Message AI assistant" })
    expect(box.closest(".max-w-3xl")).not.toBeNull()
  })

  it("on a phone's page, leaves its name to the top bar and keeps a way back", () => {
    mobile = true
    render(<AiChatPanel variant="page" />)
    expect(screen.queryByRole("heading", { name: "OneCamp AI", level: 2 })).toBeNull()
    expect(screen.getByRole("button", { name: "Close panel" })).toBeTruthy()
  })

  it("draws your words in your own colour and the answer on the neutral card, never the accent", async () => {
    render(<AiChatPanel />)
    const yours = (await screen.findByText("Who owns the launch announcement?")).parentElement!
    expect(yours.className).toContain("bg-hue-tint")
    expect(yours.className).not.toMatch(/\bbg-primary\b/)
    const answer = screen.getByText("Sam Rivera.").parentElement!
    expect(answer.className).not.toMatch(/\bbg-primary\b/)
  })

  it("keeps the accent off its marks and its quiet lines at full muted contrast", () => {
    const src = readFileSync(resolve(__dirname, "AiChatPanel.tsx"), "utf8")
    expect(src).not.toMatch(/bg-primary\/10 text-primary/)
    expect(src).not.toMatch(/hover:border-primary/)
    // A placeholder may be lighter (the design direction's text-3); words may not.
    expect(src).not.toMatch(/(?<!placeholder:)text-muted-foreground\/(60|70|80)/)
    expect(src).not.toMatch(/text-primary\/70|uppercase tracking-wide/)
    expect(src).not.toMatch(/Workspace Memory/)
  })
})
