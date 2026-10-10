import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

const fetchState = vi.hoisted(() => ({ value: { data: undefined as unknown, isLoading: false, isError: undefined as unknown, mutate: vi.fn() } }))

vi.mock("@/hooks/useFetch", () => ({ useFetch: () => fetchState.value }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("@/components/marketplace/PublishTemplateDialog", () => ({ PublishTemplateDialog: () => null }))
vi.mock("@/components/admin/WorkflowEditDialog", () => ({ WorkflowEditDialog: () => null }))

import WorkflowsCard from "@/components/admin/WorkflowsCard"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const wf = {
  id: "wf1",
  name: "Bug triage",
  is_active: true,
  trigger_type: "message",
  match_type: "any",
  keywords: '["bug"]',
  actions: '[{"type":"create_task"}]',
  run_count: 3,
}

describe("workflows", () => {
  // A failed read said "No workflows yet": a claim about the workspace's
  // automations, with no way to try again.
  it("says the list could not be loaded, with Try again, instead of claiming there are none", () => {
    const mutate = vi.fn()
    fetchState.value = { data: undefined, isLoading: false, isError: new Error("Network Error"), mutate }
    render(<WorkflowsCard />)
    expect(screen.getByText(/Couldn't load the workflows/)).toBeTruthy()
    expect(screen.queryByText(/No workflows yet/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(mutate).toHaveBeenCalled()
  })

  // Its empty state takes the hue of the place it is shown in: dusk in the
  // admin page's AI and automation group, or the hue a settings page passes.
  it("puts the empty state's icon on a hued tile, dusk by default", () => {
    fetchState.value = { data: { data: [] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    const { unmount } = render(<WorkflowsCard />)
    expect(document.querySelector(".hue-dusk")).toBeTruthy()
    unmount()
    render(<WorkflowsCard hue="moss" />)
    expect(document.querySelector(".hue-moss")).toBeTruthy()
    expect(document.querySelector(".hue-dusk")).toBeNull()
  })

  it("names each switch for the workflow it runs, and says the switches save at once", () => {
    fetchState.value = { data: { data: [wf] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<WorkflowsCard />)
    expect(screen.getByRole("switch", { name: "Run Bug triage" })).toBeTruthy()
    expect(screen.getByText(/save as you make them/)).toBeTruthy()
  })
})
