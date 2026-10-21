import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const fetchState = vi.hoisted(() => ({ value: { data: undefined as unknown, isLoading: false, isError: undefined as unknown, mutate: vi.fn() } }))

// Keyed by address: the admin users list (each workflow's maker) and the
// signed-in person have their own answers; every other read gets fetchState.
const people = vi.hoisted(() => ({
  users: undefined as unknown,
  self: undefined as unknown,
}))
// Every channel, as the pickers read it (useEveryChannel).
const everyChannel = vi.hoisted(() => ({ channels: [] as { ch_uuid: string; ch_name: string }[] }))
vi.mock("@/components/admin/useEveryChannel", () => ({ useEveryChannel: () => ({ channels: everyChannel.channels, isLoading: false, isError: false }) }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) =>
    url.includes("getAllUsersList")
      ? { data: people.users, isLoading: false, isError: undefined, mutate: vi.fn() }
      : url === "/user/profile"
        ? { data: people.self, isLoading: false, isError: undefined, mutate: vi.fn() }
        : fetchState.value,
}))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
const toggleState = vi.hoisted(() => ({ fail: false }))
vi.mock("@/services/workflowService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/workflowService")>()),
  setWorkflowActive: vi.fn(() => (toggleState.fail ? Promise.reject(new Error("Network Error")) : Promise.resolve())),
}))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("@/components/marketplace/PublishTemplateDialog", () => ({ PublishTemplateDialog: () => null }))
vi.mock("@/components/admin/WorkflowEditDialog", () => ({ WorkflowEditDialog: () => null }))

import WorkflowsCard from "@/components/admin/WorkflowsCard"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  people.users = undefined
  people.self = undefined
  toggleState.fail = false
  everyChannel.channels = []
})

const reducedMotion = (on: boolean) =>
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: on && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }))

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
  // admin page's Automation group, or the hue a settings page passes.
  // Design v3 (A16, S4): it is the 96px spot, "Automate the busywork", and an
  // example in the rows' own token grammar, so it teaches how one reads.
  it("draws the empty state as a spot in the place's hue, the agents' indigo by default, with an example sentence", () => {
    fetchState.value = { data: { data: [] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    const { unmount } = render(<WorkflowsCard />)
    expect(document.querySelector(".hue-agent")).toBeTruthy()
    unmount()
    render(<WorkflowsCard hue="moss" />)
    expect(document.querySelector(".hue-moss")).toBeTruthy()
    expect(document.querySelector(".hue-agent")).toBeNull()
    expect(screen.getByText("Automate the busywork")).toBeTruthy()
    const example = document.querySelector("[data-workflow-sentence]") as HTMLElement
    expect(example.querySelector('[data-token="trigger"]')?.textContent).toBe("a message in #support")
    expect(example.querySelector('[data-token="action"]')?.textContent).toBe("create a task in Bug triage")
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
    render(<WorkflowsCard withTitle={false} creating={false} onCreatingChange={() => {}} />)
    expect(screen.queryByRole("heading", { name: "Workflows" })).toBeNull()
    expect(screen.queryByRole("button", { name: "New workflow" })).toBeNull()
    expect(screen.getByRole("switch", { name: "Run Bug triage" })).toBeTruthy()
  })

  // Design v3: the loading rows sit in the settings card (e1, no border) at
  // the loaded rows' class, so nothing moves when the list lands.
  it("draws its loading state as the list's own rows, in the settings card", () => {
    fetchState.value = { data: undefined, isLoading: true, isError: undefined, mutate: vi.fn() }
    render(<WorkflowsCard />)
    const status = screen.getByRole("status", { name: "Loading workflows" })
    expect(status.querySelector("[data-settings-card]")).toBeTruthy()
    const rows = status.querySelectorAll("[data-workflow-skeleton-row]")
    expect(rows.length).toBe(3)
    expect((rows[0] as HTMLElement).className).toContain("cx-wf-row")
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
    expect(screen.getByText("Paused").closest("[data-state-word]")?.getAttribute("data-state-word")).toBe("neutral")
    expect(screen.getByText("Last run failed").closest("[data-state-word]")?.getAttribute("data-state-word")).toBe("danger")
  })

  // Design v3 (A16): a row says what the workflow does as one sentence, its
  // trigger, condition and action as neutral token chips (a category is never
  // a hue, §1.5), with the arrow between them. It was a hued trigger tile, a
  // line of prose and outline badges.
  it("says each workflow as a sentence with token chips for its trigger, condition and action", () => {
    fetchState.value = {
      data: { data: [{ ...wf, trigger_type: "message_posted", keywords: '["bug","crash","error"]' }] },
      isLoading: false,
      isError: undefined,
      mutate: vi.fn(),
    }
    render(<WorkflowsCard hue="moss" />)
    const row = screen.getByRole("switch", { name: "Run Bug triage" }).closest("[data-workflow-row]") as HTMLElement
    const sentence = row.querySelector("[data-workflow-sentence]") as HTMLElement
    expect(sentence.textContent).toMatch(/^When/)
    const token = (role: string) => [...sentence.querySelectorAll(`[data-token="${role}"]`)].map((t) => t.textContent)
    expect(token("trigger")).toEqual(["a message in any channel"])
    expect(token("condition")).toEqual(["\u2018bug\u2019", "\u2018crash\u2019"])
    expect(sentence.textContent).toContain("+1")
    expect(token("action")).toEqual(["create a task"])
    // Every token is the neutral chip, never a hued tile.
    for (const t of sentence.querySelectorAll("[data-token]")) expect(t.closest("[data-neutral-chip]")).toBeTruthy()
    expect(row.querySelector(".hue-moss")).toBeNull()
    expect(sentence.querySelector(".text-ink-3")?.textContent).toContain("→")
  })

  // The channel list answers 20 a page, and the names were read from its
  // first page: a workflow on the 21st channel had none. Every channel is
  // read now (useEveryChannel), as the webhook pickers read them.
  it("names a workflow's channel when it is past the list's first 20", () => {
    everyChannel.channels = Array.from({ length: 21 }, (_, i) => ({ ch_uuid: `c${i + 1}`, ch_name: `team-${i + 1}` }))
    fetchState.value = { data: { data: [{ ...wf, trigger_type: "message_posted", channel_id: "c21" }] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<WorkflowsCard />)
    const row = screen.getByRole("switch", { name: "Run Bug triage" }).closest("[data-workflow-row]") as HTMLElement
    expect(row.querySelector('[data-token="trigger"]')?.textContent).toContain("team-21")
  })

  it("keeps Edit, Save as a template and Delete behind the row's ⋯", () => {
    fetchState.value = { data: { data: [wf] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<WorkflowsCard />)
    expect(screen.getByRole("button", { name: "Actions for Bug triage" })).toBeTruthy()
    expect(screen.getByText("3 runs")).toBeTruthy()
  })
  // The personal page (S4) lists only what the signed-in person made: the
  // server answers an admin with everyone's workflows.
  it("lists only the signed-in person's own workflows on the personal page", () => {
    people.self = { data: { user_uuid: "u1" } }
    fetchState.value = {
      data: { data: [{ ...wf, created_by: "u1" }, { ...wf, id: "wf2", name: "Someone else's", created_by: "u2" }] },
      isLoading: false,
      isError: undefined,
      mutate: vi.fn(),
    }
    render(<WorkflowsCard withTitle={false} scope="mine" />)
    expect(screen.getByRole("switch", { name: "Run Bug triage" })).toBeTruthy()
    expect(screen.queryByRole("switch", { name: "Run Someone else's" })).toBeNull()
  })

  // The admin page (A16) keeps everyone's, each with who made it, from the
  // admin users list.
  it("shows every workflow on the admin page, each with its maker's avatar and name", () => {
    people.users = { data: [{ user_uuid: "u1", user_name: "Ada Park", user_profile_object_key: "" }], has_more: false }
    fetchState.value = {
      data: { data: [{ ...wf, created_by: "u1" }, { ...wf, id: "wf2", name: "Other", created_by: "u9" }] },
      isLoading: false,
      isError: undefined,
      mutate: vi.fn(),
    }
    render(<WorkflowsCard />)
    const row = screen.getByRole("switch", { name: "Run Bug triage" }).closest("[data-workflow-row]") as HTMLElement
    const owner = row.querySelector('[data-workflow-owner="u1"]') as HTMLElement
    expect(owner.textContent).toContain("Ada Park")
    const other = screen.getByRole("switch", { name: "Run Other" }).closest("[data-workflow-row]") as HTMLElement
    expect(other.querySelector("[data-workflow-owner]")).toBeNull()
  })

  // §1.6: a failed save springs the switch back and shakes its row; with
  // reduced motion the row is tinted for a moment instead.
  it("shakes the row when a switch fails to save, and springs the switch back", async () => {
    reducedMotion(false)
    toggleState.fail = true
    fetchState.value = { data: { data: [wf] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<WorkflowsCard />)
    const sw = screen.getByRole("switch", { name: "Run Bug triage" })
    fireEvent.click(sw)
    const row = sw.closest("[data-workflow-row]") as HTMLElement
    await waitFor(() => expect(row.getAttribute("data-shake")).toBe("true"))
    expect(row.hasAttribute("data-flash")).toBe(false)
    expect(sw.getAttribute("aria-checked")).toBe("true")
  })

  it("tints the row instead of shaking it when motion is reduced", async () => {
    reducedMotion(true)
    toggleState.fail = true
    fetchState.value = { data: { data: [wf] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<WorkflowsCard />)
    const sw = screen.getByRole("switch", { name: "Run Bug triage" })
    fireEvent.click(sw)
    const row = sw.closest("[data-workflow-row]") as HTMLElement
    await waitFor(() => expect(row.getAttribute("data-flash")).toBe("true"))
  })
})
