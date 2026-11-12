import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// Every channel, as the pickers read it (useEveryChannel).
vi.mock("@/components/admin/useEveryChannel", () => ({ useEveryChannel: () => ({ channels: [], isLoading: false, isError: false }) }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined, isLoading: false, isError: undefined, mutate: vi.fn() }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))
vi.mock("@/components/admin/SkillLibraryDialog", () => ({ SkillLibraryDialog: () => null }))
vi.mock("@/components/ai/MarkdownMessage", () => ({ default: () => null }))
vi.mock("@/components/admin/AgentEvalSection", () => ({ AgentEvalSection: () => null }))
vi.mock("@/components/admin/AgentLearningSection", () => ({ AgentLearningSection: () => null }))
vi.mock("@/components/admin/A2ACardSummary", () => ({ A2ACardSummary: () => null }))
vi.mock("@/components/task/TaskMoveFilterFields", () => ({ TaskMoveFilterFields: () => null, ANY_MOVE: {} }))
vi.mock("@/services/agentService", async (orig) => ({
  ...(await orig<typeof import("@/services/agentService")>()),
  createAgent: vi.fn(),
  updateAgent: vi.fn(),
  runAgent: vi.fn(),
  draftAgent: vi.fn(),
  listAgentSkills: vi.fn().mockResolvedValue([]),
}))

import { AgentEditDialog } from "@/components/admin/AgentEditDialog"
import { createAgent, draftAgent, updateAgent } from "@/services/agentService"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// A new agent is made in four steps (design v3, admin §S5): Job, Tools, Where
// it works, Review. This walks to one, past the job's required fields.
function toStep(n: number) {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Release Captain" } })
  fireEvent.change(screen.getByLabelText("Instructions"), { target: { value: "File the launch tasks." } })
  for (let i = 0; i < n; i++) fireEvent.click(screen.getByRole("button", { name: /^Next/ }))
}

function setReducedMotion(reduce: boolean) {
  window.matchMedia = ((q: string) => ({ matches: reduce && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} })) as never
}

describe("the agent editor", () => {
  // The title carries the agent's square (identity, design v3 §1.5); it was
  // the AI group's tinted tile, and orange before that.
  it("puts the agent's square beside its title, not a tinted tile or the accent", () => {
    render(<AgentEditDialog agent={null} open onClose={() => {}} onSaved={() => {}} />)
    const title = screen.getByRole("heading", { name: "New agent" })
    expect(title.querySelector("[data-agent-avatar]")).toBeTruthy()
    expect(title.querySelector("[class*='hue-']")).toBeNull()
    expect(title.querySelector(".text-primary")).toBeNull()
  })

  it("makes a new agent in four steps", () => {
    render(<AgentEditDialog agent={null} open onClose={() => {}} onSaved={() => {}} />)
    const steps = [...document.querySelectorAll("[data-agent-stepper] li")].map((li) => li.textContent)
    expect(steps).toEqual(["Job", "Tools", "Where it works", "Review"])
    expect(document.querySelector("[aria-current='step']")?.textContent).toBe("Job")
    toStep(3)
    expect(document.querySelector("[aria-current='step']")?.textContent).toBe("Review")
  })

  it("says in Review, in one sentence on a sunken card, what the agent may do", () => {
    render(<AgentEditDialog agent={null} open onClose={() => {}} onSaved={() => {}} />)
    toStep(3)
    const card = document.querySelector("[data-governance-sentence]") as HTMLElement
    expect(card.className).toContain("agent-governance")
    expect(card.textContent).toBe("Release Captain acts for you. It can do only what you can, wherever it is asked, and every action is on the record.")
    expect(card.querySelector("svg.text-agent")).toBeTruthy()
  })

  it("groups the tools by what they can do: reads, then actions", () => {
    render(<AgentEditDialog agent={null} open onClose={() => {}} onSaved={() => {}} />)
    toStep(1)
    const groups = [...document.querySelectorAll("[data-tool-risk]")].map((g) => (g as HTMLElement).dataset.toolRisk)
    expect(groups).toEqual(["read", "write"])
  })

  // The agent's birth (admin §S5): its square assembles before the dialog
  // closes; under reduced motion there is no flourish and it closes at once.
  it("plays the birth on create, and skips it under reduced motion", async () => {
    vi.mocked(createAgent).mockResolvedValue({} as never)
    setReducedMotion(true)
    const quiet = vi.fn()
    render(<AgentEditDialog agent={null} open onClose={() => {}} onSaved={quiet} />)
    toStep(3)
    fireEvent.click(screen.getByRole("button", { name: /Create agent/ }))
    await waitFor(() => expect(quiet).toHaveBeenCalled())
    expect(document.querySelector("[data-agent-birth]")).toBeNull()
    cleanup()

    setReducedMotion(false)
    const saved = vi.fn()
    render(<AgentEditDialog agent={null} open onClose={() => {}} onSaved={saved} />)
    toStep(3)
    fireEvent.click(screen.getByRole("button", { name: /Create agent/ }))
    const birth = await waitFor(() => {
      const el = document.querySelector("[data-agent-birth]")
      expect(el).toBeTruthy()
      return el as HTMLElement
    })
    expect(birth.className).toContain("agent-birth")
    expect(saved).not.toHaveBeenCalled()
    await waitFor(() => expect(saved).toHaveBeenCalled(), { timeout: 2000 })
  })

  // A missing name was one red line at the very foot of a long dialog.
  it("says a missing name under the name, and puts the cursor there", async () => {
    render(<AgentEditDialog agent={null} open onClose={() => {}} onSaved={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }))
    const name = screen.getByLabelText("Name")
    await waitFor(() => expect(name.getAttribute("aria-invalid")).toBe("true"))
    expect(document.activeElement).toBe(name)
    expect(createAgent).not.toHaveBeenCalled()
  })

  it("says missing instructions under them, and puts the cursor there", async () => {
    render(<AgentEditDialog agent={null} open onClose={() => {}} onSaved={() => {}} />)
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Standup bot" } })
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }))
    const instr = screen.getByLabelText("Instructions")
    await waitFor(() => expect(instr.getAttribute("aria-invalid")).toBe("true"))
    expect(document.activeElement).toBe(instr)
  })

  // Tool chips were pills with no pressed state; group labels shouted.
  it("draws tool choices as 4px chips with a pressed state, under sentence-case labels", () => {
    render(<AgentEditDialog agent={null} open onClose={() => {}} onSaved={() => {}} />)
    toStep(1)
    const chips = Array.from(document.querySelectorAll("button[aria-pressed]"))
    expect(chips.length).toBeGreaterThan(0)
    for (const chip of chips) expect(chip.className).not.toMatch(/\brounded-full\b/)
    expect(document.body.innerHTML).not.toMatch(/\buppercase\b/)
  })

  // ST-36: the autonomy cards were buttons that said nothing when chosen,
  // and inserted a check that pushed the title along.
  it("chooses autonomy from a radio group of cards that keep the check's place", () => {
    render(<AgentEditDialog agent={null} open onClose={() => {}} onSaved={() => {}} />)
    toStep(2)
    const group = screen.getByRole("radiogroup", { name: "Autonomy for write actions" })
    // The options' words are AUTONOMY's (ADMIN-16), so this picks "Plan, then ask" (it was "Require approval").
    const plan = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]')).find((r) => /Plan, then ask/.test(r.textContent ?? ""))!
    fireEvent.click(plan)
    expect(plan.getAttribute("aria-checked")).toBe("true")
    // Each card keeps its check's slot (MenuCheck), on or off.
    for (const r of Array.from(group.querySelectorAll('[role="radio"]'))) expect(r.querySelectorAll("[data-menu-check]")).toHaveLength(1)
    expect(plan.querySelector("[data-menu-check]")!.getAttribute("data-menu-check")).toBe("on")
  })

  // ADMIN-16: a new agent asked nothing and acted on its own; now it asks
  // first until someone chooses otherwise, and the choice says so.
  it("a new agent starts on Ask first, marked Recommended, the safest option first", () => {
    render(<AgentEditDialog agent={null} open onClose={() => {}} onSaved={() => {}} />)
    toStep(2)
    const group = screen.getByRole("radiogroup", { name: "Autonomy for write actions" })
    const radios = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]'))
    expect(radios.map((r) => r.querySelector("[data-autonomy-title]")?.textContent)).toEqual(["Ask first", "Plan, then ask", "Act on its own"])
    expect(radios[0].getAttribute("aria-checked")).toBe("true")
    expect(radios[0].textContent).toContain("Recommended")
    expect(radios[0].textContent).toContain("Each change waits for your yes in Inbox, then runs as you.")
    expect(radios.filter((r) => /Recommended/.test(r.textContent ?? ""))).toHaveLength(1)
    // The box is a sunken note, not the legacy bordered tint.
    const box = group.parentElement as HTMLElement
    expect(box.className).toContain("bg-sunken")
    expect(box.className).not.toMatch(/\bborder\b|bg-muted/)
  })

  it("no option mentions 90/10", () => {
    render(<AgentEditDialog agent={null} open onClose={() => {}} onSaved={() => {}} />)
    toStep(2)
    expect(screen.getByRole("radiogroup", { name: "Autonomy for write actions" }).textContent).not.toContain("90/10")
  })

  it("an agent with no autonomy reads as Ask first", () => {
    const agent = {
      id: "agent-9", name: "Old helper", instructions: "Help.", enabled_tools: "[]", trigger_type: "manual", trigger_config: "{}",
      scope: "{}", max_steps: 8, is_active: true, dm_able: false, autonomy: "", run_count: 0,
    }
    render(<AgentEditDialog agent={agent as never} open onClose={() => {}} onSaved={() => {}} />)
    const group = screen.getByRole("radiogroup", { name: "Autonomy for write actions" })
    const checked = group.querySelector('[role="radio"][aria-checked="true"]')
    expect(checked?.querySelector("[data-autonomy-title]")?.textContent).toBe("Ask first")
  })

  // CODE-REVIEWER-264 T1: only a new agent starts on Ask first; an existing
  // one opens on its own mode and a save sends that mode back unchanged.
  it("an existing agent opens on its own mode and saves it unchanged", async () => {
    vi.mocked(updateAgent).mockResolvedValue({} as never)
    for (const [mode, title] of [["auto", "Act on its own"], ["plan", "Plan, then ask"]] as const) {
      const agent = {
        id: "agent-7", name: "Lookout", instructions: "Watch the launch.", enabled_tools: "[]", trigger_type: "manual", trigger_config: "{}",
        scope: "{}", max_steps: 8, is_active: true, dm_able: false, autonomy: mode, run_count: 2,
      }
      const saved = vi.fn()
      render(<AgentEditDialog agent={agent as never} open onClose={() => {}} onSaved={saved} />)
      const group = screen.getByRole("radiogroup", { name: "Autonomy for write actions" })
      expect(group.querySelector('[role="radio"][aria-checked="true"] [data-autonomy-title]')?.textContent, mode).toBe(title)
      fireEvent.click(screen.getByRole("button", { name: /Save changes/ }))
      await waitFor(() => expect(saved).toHaveBeenCalled())
      expect(vi.mocked(updateAgent).mock.calls.at(-1)?.[1], mode).toMatchObject({ autonomy: mode })
      cleanup()
    }
  })

  // CODE-REVIEWER-264 T2: a drafted agent takes the draft's mode, and anything
  // else reads as Ask first, never as acting on its own.
  it("a drafted agent starts on the draft's mode, and on Ask first for anything else", async () => {
    for (const [mode, title] of [["approval", "Ask first"], ["plan", "Plan, then ask"], ["", "Ask first"]] as const) {
      vi.mocked(draftAgent).mockResolvedValue({
        name: "Release Captain", description: "", instructions: "File the launch tasks.", enabled_tools: [], trigger_type: "manual", autonomy: mode,
      } as never)
      render(<AgentEditDialog agent={null} open onClose={() => {}} onSaved={() => {}} />)
      fireEvent.change(screen.getByLabelText(/Describe your agent/), { target: { value: "File the launch tasks each morning." } })
      fireEvent.click(screen.getByRole("button", { name: /Draft with AI/ }))
      await waitFor(() => expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Release Captain"))
      for (let i = 0; i < 2; i++) fireEvent.click(screen.getByRole("button", { name: /^Next/ }))
      const group = screen.getByRole("radiogroup", { name: "Autonomy for write actions" })
      expect(group.querySelector('[role="radio"][aria-checked="true"] [data-autonomy-title]')?.textContent, JSON.stringify(mode)).toBe(title)
      cleanup()
    }
  })

  it("chooses the trigger from a radio group", () => {
    render(<AgentEditDialog agent={null} open onClose={() => {}} onSaved={() => {}} />)
    toStep(2)
    const group = screen.getByRole("radiogroup", { name: "Trigger" })
    const radios = Array.from(group.querySelectorAll('[role="radio"]'))
    expect(radios.length).toBeGreaterThan(1)
    expect(radios.some((r) => r.getAttribute("aria-checked") === "true")).toBe(true)
  })

  // Schedule opened with an unlabelled row of buttons where Event and Mention
  // open with a label.
  it("opens Schedule with a label, as Event and Mention open with theirs", () => {
    render(<AgentEditDialog agent={null} open onClose={() => {}} onSaved={() => {}} />)
    toStep(2)
    fireEvent.click(screen.getByRole("radio", { name: "On a schedule" }))
    const mode = screen.getByRole("radiogroup", { name: "When it runs" })
    const label = screen.getByText("When it runs")
    expect(label.tagName).toBe("LABEL")
    expect(label.compareDocumentPosition(mode) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  // Each single choice was a row of bordered chips with the choice in the
  // accent, beside the house segmented control everywhere else.
  it("makes each single choice with the house segmented control", () => {
    render(<AgentEditDialog agent={null} open onClose={() => {}} onSaved={() => {}} />)
    toStep(2)
    fireEvent.click(screen.getByRole("radio", { name: "On a schedule" }))
    for (const name of ["Trigger", "When it runs", "How often should it run?"]) {
      const group = screen.getByRole("radiogroup", { name })
      const radios = Array.from(group.querySelectorAll('[role="radio"]'))
      expect(radios.length).toBeGreaterThan(1)
      for (const r of radios) {
        // The house segmented control: a tab of the interaction layer in its well,
        // which raises the chosen one (app/interaction.css, [data-segmented]).
        expect(r.closest("[data-segmented]")).not.toBeNull()
        expect(r.getAttribute("data-interactive")).toBe("tab")
        expect(r.className).not.toContain("border-primary")
      }
    }
  })
})
