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

  // On the admin page it is the tab's section: its title the tab's h2 (it was
  // a CardTitle div) and "New workflow" in the header's slot at the shared
  // height (it was a 36px default button, Members' is 32px).
  it("is a section titled by an h2 on the admin page, with New workflow in the header's slot", () => {
    fetchState.value = { data: { data: [wf] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<WorkflowsCard />)
    const heading = screen.getByRole("heading", { level: 2, name: "Workflows" })
    const action = heading.closest("section")?.querySelector("[data-section-action]") as HTMLElement
    const button = screen.getByRole("button", { name: "New workflow" })
    expect(action.contains(button)).toBe(true)
    expect(button.className).toContain("md:h-8")
    expect(button.className).toContain("h-11")
  })

  // On the settings page the page's h1 already says "Workflows" and holds the
  // one action; the card repeated both under it.
  it("draws no title and no button of its own on a settings page, and opens the editor when the page asks", () => {
    fetchState.value = { data: { data: [wf] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<WorkflowsCard header={false} creating={false} onCreatingChange={() => {}} />)
    expect(screen.queryByRole("heading", { name: "Workflows" })).toBeNull()
    expect(screen.queryByRole("button", { name: "New workflow" })).toBeNull()
    expect(screen.getByRole("switch", { name: "Run Bug triage" })).toBeTruthy()
  })

  it("draws its loading state as the list's own rows, in the list's frame", () => {
    fetchState.value = { data: undefined, isLoading: true, isError: undefined, mutate: vi.fn() }
    render(<WorkflowsCard />)
    const status = screen.getByRole("status", { name: "Loading workflows" })
    expect(status.className).toContain("divide-y")
    expect(status.className).toContain("rounded-lg")
    const rows = status.querySelectorAll("[data-workflow-skeleton-row]")
    expect(rows.length).toBe(3)
    expect((rows[0] as HTMLElement).className).toContain("px-4")
    expect((rows[0] as HTMLElement).className).toContain("py-3")
  })

  it("says a failed read in the compact form under its title, with the server's reason", () => {
    fetchState.value = { data: undefined, isLoading: false, isError: { response: { status: 503, data: { msg: "The workflow engine is restarting." } } }, mutate: vi.fn() }
    render(<WorkflowsCard />)
    expect(screen.getByRole("heading", { level: 2, name: "Workflows" })).toBeTruthy()
    expect(screen.getByText("The workflow engine is restarting.")).toBeTruthy()
    expect(document.querySelector("[data-empty-illustration]")).toBeTruthy()
  })

  it("says a paused workflow and a failed run with the app's status word", () => {
    fetchState.value = { data: { data: [{ ...wf, is_active: false, last_error: "boom" }] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<WorkflowsCard />)
    expect(screen.getByText("Paused").closest("[data-status-word]")?.getAttribute("data-status-word")).toBe("neutral")
    expect(screen.getByText("Last run failed").closest("[data-status-word]")?.getAttribute("data-status-word")).toBe("danger")
  })

  // Every row leads with what sets it off, on a tile in the place's hue, as
  // Archive's rules lead with their kind.
  it("leads each row with its trigger on a tile in the place's hue", () => {
    fetchState.value = { data: { data: [wf] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<WorkflowsCard hue="moss" />)
    const row = screen.getByRole("switch", { name: "Run Bug triage" }).closest("[data-workflow-row]") as HTMLElement
    const tile = row.firstElementChild as HTMLElement
    expect(tile.className).toContain("hue-moss")
    expect(tile.className).toContain("size-8")
  })
})
