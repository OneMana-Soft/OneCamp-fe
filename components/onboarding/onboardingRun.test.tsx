import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { OnboardingState, OnboardingStep } from "@/services/onboardingService"

// design-15: a new workspace's guided first run walks the checklist's own
// steps in one place (invite, import, a sample project) instead of sending the
// admin to an admin screen for each, and the sample goes in one step.

const svc = vi.hoisted(() => ({
  makeSampleProject: vi.fn(),
  removeSampleProject: vi.fn(),
  getOnboardingStatus: vi.fn(),
  dismissOnboarding: vi.fn(),
  setStepSkipped: vi.fn(),
}))
vi.mock("@/services/onboardingService", () => svc)
vi.mock("@/services/onboardingSampleService", () => svc)
// A computer unless a test says it's a phone (the sheet mode, components/ui/overlayMode).
const mode = vi.hoisted(() => ({ sheet: false }))
vi.mock("@/components/ui/overlayMode", async (actual) => ({ ...(await actual<object>()), useSheetMode: () => mode.sheet }))
// The steps' own pieces, standing in: the run places them, it doesn't copy them.
vi.mock("@/components/invite/InviteForm", () => ({ InviteForm: () => <div data-testid="invite-form" /> }))
vi.mock("@/components/admin/ImportCard", () => ({
  default: ({ firstRun, onStarted }: { firstRun?: boolean; onStarted?: () => void }) => (
    <div data-testid="import-card" data-first-run={firstRun ? "" : undefined}>
      <button type="button" onClick={onStarted}>
        started
      </button>
    </div>
  ),
}))
vi.mock("next/dynamic", () => ({
  default: (load: () => Promise<{ default: React.ComponentType }>) => {
    const Lazy = (props: Record<string, unknown>) => {
      const [C, setC] = React.useState<React.ComponentType | null>(null)
      React.useEffect(() => {
        void load().then((m) => setC(() => m.default))
      }, [])
      return C ? <C {...props} /> : null
    }
    return Lazy
  },
}))
import React from "react"

const { default: OnboardingRun, runStepDone, RUN_STEPS } = await import("./OnboardingRun")

const step = (id: string, done = false): OnboardingStep => ({ id, title: id, detail: "", href: "/", done })
const state = (over: Partial<OnboardingState> = {}): OnboardingState => ({
  dismissed: false,
  steps: [step("people"), step("import"), step("project")],
  done: 0,
  total: 3,
  complete: false,
  skipped: 0,
  ...over,
})

beforeEach(() => {
  mode.sheet = false
  svc.makeSampleProject.mockReset().mockResolvedValue({ project_uuid: "p-1", team_uuid: "t-1", created_at: "" })
  svc.removeSampleProject.mockReset().mockResolvedValue(undefined)
})
afterEach(cleanup)

// Moving on: "Skip for now" on the invite step until someone is invited, "Next" after.
const next = () => fireEvent.click(screen.queryByRole("button", { name: "Skip for now" }) ?? screen.getByRole("button", { name: "Next" }))

describe("the guided first run", () => {
  it("answers what is done from the server's checklist, not its own list", () => {
    const s = state({ steps: [step("people", true), step("import")], sample: { project_uuid: "p", team_uuid: "t", created_at: "" } })
    expect(runStepDone("people", s)).toBe(true)
    expect(runStepDone("import", s)).toBe(false)
    expect(runStepDone("sample", s)).toBe(true)
    expect(runStepDone("sample", state())).toBe(false)
    expect(RUN_STEPS.map((r) => r.key)).toEqual(["people", "import", "sample", "done"])
  })

  it("walks the steps with the existing invite form and import card in place", async () => {
    render(<OnboardingRun state={state()} refresh={() => {}} onClose={() => {}} />)
    expect(screen.getByTestId("invite-form")).toBeTruthy()
    expect(screen.getByText("Step 1 of 4")).toBeTruthy()
    // The checklist's own segmented bar, not a second progress of the run's.
    expect(screen.getByRole("progressbar", { name: /^Step 1 of 4/ }).hasAttribute("data-segmented-progress")).toBe(true)
    await act(async () => next())
    // Admin › Import's own card, in its first-run mode: the tools first.
    expect((await screen.findByTestId("import-card")).hasAttribute("data-first-run")).toBe(true)
    expect(screen.getByRole("progressbar", { name: /^Step 2 of 4/ }).getAttribute("aria-valuenow")).toBe("50")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Back" })))
    expect(screen.getByTestId("invite-form")).toBeTruthy()
  })

  it("gives the invite form's actions the sheet's 44px buttons on a phone, and the dialog's own on a computer", async () => {
    render(<OnboardingRun state={state()} refresh={() => {}} onClose={() => {}} />)
    expect(document.querySelector("[data-invite-actions]")?.className.split(" ")).not.toContain("[&_button]:h-11")
    cleanup()
    mode.sheet = true
    render(<OnboardingRun state={state()} refresh={() => {}} onClose={() => {}} />)
    const slot = await vi.waitFor(() => {
      const el = document.querySelector("[data-invite-actions]")
      if (!el) throw new Error("the sheet's footer isn't up yet")
      return el
    })
    // In a landscape phone too, which the footer CSS's width query misses.
    expect(slot.className.split(" ")).toContain("[&_button]:h-11")
  })

  // The tiles are the import step's job: Not now and Next both moved on, and
  // the orange Next competed with them (DESIGN-BUILD-3, 20 Oct).
  it("offers a quiet skip on the import step until an import has started, then Next", async () => {
    const refresh = vi.fn()
    render(<OnboardingRun state={state()} refresh={refresh} onClose={() => {}} />)
    await act(async () => next())
    await screen.findByTestId("import-card")
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Not now" })).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "started" })))
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Skip for now" })).toBeNull()
    expect(refresh).toHaveBeenCalled()
  })

  // "is free." and "Import." sat alone on their last lines: the step lines
  // are short, so they balance (text-pretty only moves a lone word).
  it("balances its step lines, so no last line is left short", async () => {
    render(<OnboardingRun state={state()} refresh={() => {}} onClose={() => {}} />)
    await act(async () => next())
    const line = screen.getByText(/Bring projects, tasks and people/)
    expect(line.className.split(" ")).toContain("text-balance")
  })

  it("offers Next on the import step when the workspace has already imported", async () => {
    render(<OnboardingRun state={state({ steps: [step("people"), step("import", true), step("project")] })} refresh={() => {}} onClose={() => {}} />)
    await act(async () => next())
    await screen.findByTestId("import-card")
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Skip for now" })).toBeNull()
  })

  it("has one primary action on the invite step: the form's Send, with a quiet skip", () => {
    render(<OnboardingRun state={state()} refresh={() => {}} onClose={() => {}} />)
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull()
  })

  it("makes the sample once, opens it, and removes it in one step", async () => {
    const refresh = vi.fn()
    const { rerender } = render(<OnboardingRun state={state()} refresh={refresh} onClose={() => {}} />)
    await act(async () => next())
    await act(async () => next())
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Make the sample project" })))
    expect(svc.makeSampleProject).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalled()
    rerender(<OnboardingRun state={state({ sample: { project_uuid: "p-1", team_uuid: "t-1", created_at: "" } })} refresh={refresh} onClose={() => {}} />)
    expect(screen.getByRole("link", { name: "Open it" }).getAttribute("href")).toBe("/app/project/p-1")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Remove the sample" })))
    expect(svc.removeSampleProject).toHaveBeenCalledTimes(1)
  })

  it("says why when the sample can't be made", async () => {
    svc.makeSampleProject.mockRejectedValue({})
    render(<OnboardingRun state={state()} refresh={() => {}} onClose={() => {}} />)
    await act(async () => next())
    await act(async () => next())
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Make the sample project" })))
    expect(screen.getByRole("alert").textContent).toMatch(/sample project/i)
  })

  // design-15's way to WIN (DESIGN-BUILD-3): the run makes a doc too, and
  // its last step teaches the three keys, as Linear's command-menu lesson does.
  it("opens the sample's brief beside the project, when it has one", async () => {
    const sampled = state({ sample: { project_uuid: "p-1", team_uuid: "t-1", doc_uuid: "d-1", created_at: "" } })
    const { rerender } = render(<OnboardingRun state={sampled} refresh={() => {}} onClose={() => {}} />)
    await act(async () => next())
    await act(async () => next())
    expect(screen.getByRole("link", { name: "Open the brief" }).getAttribute("href")).toBe("/app/doc/d-1")
    rerender(<OnboardingRun state={state({ sample: { project_uuid: "p-1", team_uuid: "t-1", created_at: "" } })} refresh={() => {}} onClose={() => {}} />)
    expect(screen.queryByRole("link", { name: "Open the brief" })).toBeNull()
  })

  it("teaches the three keys on its last step, ticking each one tried, and the corner tip need not", async () => {
    localStorage.removeItem("oc_keys_tip_seen")
    render(<OnboardingRun state={state()} refresh={() => {}} onClose={() => {}} />)
    for (let i = 0; i < 3; i++) await act(async () => next())
    const lesson = screen.getByRole("region", { name: "Three keys worth knowing" })
    // A key hint: the shared rule hides it where there's no keyboard.
    expect(lesson.hasAttribute("data-kbd-hint")).toBe(true)
    expect(lesson.querySelectorAll("[data-row]")).toHaveLength(3)
    expect(lesson.querySelector('[data-row="help"] [aria-label="Tried"]')).toBeNull()
    await act(async () => void fireEvent.keyDown(document, { key: "?" }))
    expect(lesson.querySelector('[data-row="help"] [aria-label="Tried"]')).not.toBeNull()
    expect(localStorage.getItem("oc_keys_tip_seen")).toBe("1")
  })

  it("ends on what is left, and Done closes it", async () => {
    const onClose = vi.fn()
    render(<OnboardingRun state={state({ steps: [step("people", true), step("import")] })} refresh={() => {}} onClose={onClose} />)
    for (let i = 0; i < 3; i++) await act(async () => next())
    expect(screen.getByText(/stays on Home/)).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Done" })))
    expect(onClose).toHaveBeenCalled()
  })
})
