import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

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
