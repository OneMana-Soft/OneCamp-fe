import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// The settings pages that depend on a permission or on the server's AI. Each
// opens with its section's header at once and holds its place until the answer
// is in: the AI pages used to say "runs without AI" on a server that has it,
// until its config arrived. A member without the permission is told who can
// change that and where: the workflows page sent them to "Settings →
// Permissions", which does not exist; Permissions is under Admin.

const { caps, ai } = vi.hoisted(() => ({ caps: { isLoading: false, granted: true }, ai: { state: "available" as string } }))
vi.mock("@/hooks/useCapabilities", () => ({ useCapabilities: () => ({ can: () => caps.granted, isLoading: caps.isLoading }) }))
vi.mock("@/hooks/useClientConfig", () => ({ FEATURE_AI: "ai", useFeatureState: () => ai.state, useAIAvailable: () => ai.state === "available" }))
vi.mock("@/components/admin/WorkflowsCard", () => ({ default: ({ hue }: { hue?: string }) => <div data-testid="workflows-card" data-hue={hue} /> }))
vi.mock("@/components/admin/AgentsCard", () => ({ default: () => <div data-testid="agents-card" /> }))
vi.mock("@/components/admin/McpServersCard", () => ({ default: () => null }))
vi.mock("@/components/admin/DataSourcesCard", () => ({ default: () => null }))
vi.mock("@/components/ai/MyAIActivityCard", () => ({ default: () => <div data-testid="my-activity" /> }))
vi.mock("@/components/ai/MyAssistantsCard", () => ({ default: () => <div data-testid="assistants-card" /> }))

import WorkflowsSettingsPage from "./workflows/page"
import AgentsSettingsPage from "./agents/page"
import AssistantsSettingsPage from "./assistants/page"

beforeEach(() => {
  caps.isLoading = false
  caps.granted = true
  ai.state = "available"
})
afterEach(cleanup)

const h1 = () => screen.getByRole("heading", { level: 1 })

describe("workflows", () => {
  it("opens with its header and holds its place while permissions load", () => {
    caps.isLoading = true
    render(<WorkflowsSettingsPage />)
    expect(h1()).toHaveAccessibleName("Workflows")
    expect(screen.getByRole("status", { name: "Loading workflows" })).toBeInTheDocument()
    expect(screen.queryByText(/turned off/)).toBeNull()
  })

  it("tells a member without the permission where an admin turns it on", () => {
    caps.granted = false
    render(<WorkflowsSettingsPage />)
    expect(screen.getByText(/Admin, Permissions/)).toBeInTheDocument()
    expect(screen.queryByText(/Settings →/)).toBeNull()
    expect(screen.queryByTestId("workflows-card")).toBeNull()
  })

  it("shows the workflows in the section's own hue", () => {
    render(<WorkflowsSettingsPage />)
    expect(screen.getByTestId("workflows-card")).toHaveAttribute("data-hue", "moss")
  })
})

describe("agents and skills", () => {
  it("does not say the server has no AI before the server has said", () => {
    ai.state = "unknown"
    render(<AgentsSettingsPage />)
    expect(h1()).toHaveAccessibleName("Agents and skills")
    expect(screen.getByRole("status", { name: "Loading agents and skills" })).toBeInTheDocument()
    expect(screen.queryByText(/without AI/)).toBeNull()
  })

  it("says so when the server has no AI", () => {
    ai.state = "unavailable"
    render(<AgentsSettingsPage />)
    expect(screen.getByText(/runs without AI/)).toBeInTheDocument()
  })

  it("shows a member without the permission what was done in their name", () => {
    caps.granted = false
    render(<AgentsSettingsPage />)
    expect(screen.getByText(/Admin, Permissions/)).toBeInTheDocument()
    expect(screen.getByTestId("my-activity")).toBeInTheDocument()
    expect(screen.queryByTestId("agents-card")).toBeNull()
  })
})

describe("your AI assistants", () => {
  it("does not say the workspace has no AI before the server has said", () => {
    ai.state = "unknown"
    render(<AssistantsSettingsPage />)
    expect(h1()).toHaveAccessibleName("Your AI assistants")
    expect(screen.getByRole("status", { name: "Loading your AI assistants" })).toBeInTheDocument()
    expect(screen.queryByText(/without AI/)).toBeNull()
  })

  it("says so, in a line rather than a box, when there is no AI", () => {
    ai.state = "unavailable"
    render(<AssistantsSettingsPage />)
    const line = screen.getByText(/runs without AI/)
    expect(line.className).not.toMatch(/rounded-2xl|border/)
  })

  it("shows the assistants when there is AI", () => {
    render(<AssistantsSettingsPage />)
    expect(screen.getByTestId("assistants-card")).toBeInTheDocument()
  })
})
