import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// The page's one primary action, New agent, sits in its header beside the h1,
// as New token does on API tokens; the Agents section below it then draws no
// button of its own, and opens its dialog when the header's is pressed.
vi.mock("@/hooks/useCapabilities", () => ({ useCapabilities: () => ({ can: () => true, isLoading: false }) }))
vi.mock("@/hooks/useClientConfig", () => ({ FEATURE_AI: "ai", useFeatureState: () => "available", useAIAvailable: () => true }))
vi.mock("@/components/admin/AgentsCard", () => ({
  default: ({ creating, onCreatingChange }: { creating?: boolean; onCreatingChange?: (open: boolean) => void }) => (
    <div data-testid="agents-section" data-creating={String(!!creating)} data-held={String(!!onCreatingChange)} />
  ),
}))
vi.mock("@/components/admin/McpServersCard", () => ({ default: () => null }))
vi.mock("@/components/admin/DataSourcesCard", () => ({ default: () => null }))
vi.mock("@/components/ai/MyAIActivityCard", () => ({ default: () => null }))

import AgentsSettingsPage from "./page"
import { governanceSentence } from "@/lib/agentCardCopy"

afterEach(cleanup)

describe("agents and skills", () => {
  it("puts New agent in the page's header, at the section actions' height, and it opens the Agents section's dialog", () => {
    render(<AgentsSettingsPage />)
    const header = screen.getByRole("banner")
    const button = within(header).getByRole("button", { name: "New agent" })
    expect(button.className).toContain("md:h-8")
    const section = screen.getByTestId("agents-section")
    expect(section.dataset.held).toBe("true")
    expect(section.dataset.creating).toBe("false")
    fireEvent.click(button)
    expect(screen.getByTestId("agents-section").dataset.creating).toBe("true")
  })
})

// Design v3 (admin §S5). The cards' anatomy and the editor's steps are
// rendered in agentsCard.test.tsx and agentEditDialog.test.tsx; these hold the
// page-level promises: two columns of cards, the review's one sentence, and an
// agent's birth that never plays under reduced motion.
describe("agents and skills, design v3", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

  it("lays agents out as cards in two columns, one on a phone", () => {
    const src = read("components/admin/AgentsCard.tsx")
    expect(src).toMatch(/className="grid gap-3 md:grid-cols-2" data-agent-grid=""/)
    expect(src).toMatch(/className="agent-card"/)
    expect(src).toMatch(/agent-card-foot/)
  })

  // From the copy module, not the dialog: importing the dialog for one sentence
  // took 2.7 s of the test, at the 5 s limit on a busy machine.
  it("says in Review who the agent acts for, its limit, where, and the record", () => {
    expect(governanceSentence("Release Captain", 2)).toBe(
      "Release Captain acts for you. It can do only what you can, in the 2 channels you chose, and every action is on the record.",
    )
  })

  it("skips the birth under reduced motion, in the component and in the stylesheet", () => {
    expect(read("components/admin/AgentEditDialog.tsx")).toMatch(/if \(!editing && !prefersReducedMotion\(\)\)/)
    const css = read("app/styles/admin/ai.css")
    const still = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce) {\n    .agent-birth"))
    expect(still).toMatch(/\.agent-birth,\s*\.agent-birth svg \{\s*animation: none;/)
  })
})
