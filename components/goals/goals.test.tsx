import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { GoalDetail, GoalSummary } from "@/lib/goals"

// The goals list and a goal's page, with the server's answers stood in.

const pushed: string[] = []
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: (u: string) => pushed.push(u) }) }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
vi.mock("react-redux", () => ({ useSelector: (pick: (s: unknown) => unknown) => pick({ users: { userSidebar: { userChannels: [] } } }) }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: undefined, isLoading: false }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me", user_full_name: "Sam Rivera" } } }),
}))
vi.mock("@/hooks/useClientConfig", () => ({ useFeature: () => false, FEATURE_AI: "ai" }))
vi.mock("@/hooks/useProjectsOverview", () => ({ useProjectsOverview: () => ({ projects: [] }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))

const summary = (id: string, over: Partial<GoalSummary> = {}): GoalSummary => ({
  id,
  title: id,
  owner: { user_uuid: "me", user_full_name: "Sam Rivera" },
  due_date: "2099-12-31",
  measure: "projects",
  progress: 0.4,
  expected: 0.5,
  status: "open",
  projects: 1,
  subgoals: 0,
  can_edit: true,
  created_at: "2026-10-01T00:00:00Z",
  checked_in_at: new Date().toISOString(),
  health: "on_track",
  ...over,
})

let list: GoalSummary[] = []
const goalHook = {
  goal: undefined as GoalDetail | undefined,
  postCheckIn: vi.fn().mockResolvedValue({ checkin: { id: "c1" } }),
  draft: vi.fn().mockResolvedValue({ text: "Now at 410 teams: 50% of the way.", health: "at_risk" }),
}
vi.mock("@/hooks/useGoals", () => ({
  useGoals: () => ({ goals: list, isLoading: false, isError: false, create: vi.fn(), refresh: vi.fn() }),
  useGoal: () => ({
    goal: goalHook.goal,
    isLoading: false,
    isError: false,
    notFound: false,
    refresh: vi.fn(),
    remove: vi.fn(),
    reopen: vi.fn(),
    linkProject: vi.fn(),
    unlinkProject: vi.fn(),
    draft: goalHook.draft,
    aiDraft: vi.fn(),
    postCheckIn: goalHook.postCheckIn,
    editCheckIn: vi.fn(),
    removeCheckIn: vi.fn(),
  }),
}))

const { GoalsView } = await import("@/components/goals/GoalsView")
const { GoalPage } = await import("@/components/goals/GoalPage")

afterEach(() => {
  cleanup()
  localStorage.clear()
  toast.mockReset()
})

describe("the goals list", () => {
  it("shows open goals with their sub-goals under them, and which need a check-in", () => {
    list = [
      summary("Win 50 customers", { measure: "subgoals", subgoals: 1 }),
      summary("Reach 500 teams", {
        parent_id: "Win 50 customers",
        measure: "number",
        current_value: 410,
        target_value: 500,
        unit: "teams",
        checked_in_at: undefined,
        health: undefined,
      }),
      summary("Old goal", { status: "dropped" }),
    ]
    render(<GoalsView compact={false} />)
    const rows = screen.getAllByRole("row").slice(1)
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining("Win 50 customers"), expect.stringContaining("410 of 500 teams")])
    expect(screen.getByText("No check-in yet")).toBeTruthy()
    expect(screen.getByText("1 goal needs a check-in")).toBeTruthy()
    // Progress is drawn against the goal's time.
    expect(screen.getAllByRole("progressbar")[0].getAttribute("aria-label")).toContain("with 50% of its time gone")

    fireEvent.click(screen.getByRole("radio", { name: /Closed/ }))
    expect(screen.getByText("Old goal")).toBeTruthy()
    expect(screen.queryByText("Reach 500 teams")).toBeNull()
  })

  it("on a phone, shows each goal's card with how far it is as a ring", () => {
    list = [summary("g1", { title: "Reach 500 teams", progress: 0.4 })]
    render(<GoalsView compact />)
    expect(screen.getByRole("progressbar", { name: "Reach 500 teams: 40%" })).toBeTruthy()
  })

  it("explains goals when there are none", () => {
    list = []
    const { container } = render(<GoalsView compact={false} />)
    expect(screen.getByText("No goals yet")).toBeTruthy()
    // New goal is in the toolbar row from the first paint, where it is when
    // there are goals, rather than a second button in the empty state.
    expect(screen.getByRole("button", { name: "New goal" })).toBeTruthy()
    // The empty state's spot, in the goals' hue (the playful layer).
    expect(container.querySelector("[data-empty-illustration] svg.hue-sun")).toBeTruthy()
  })
})

describe("a goal's page", () => {
  const detail = (): GoalDetail => ({
    ...summary("Reach 500 paying teams", {
      measure: "number",
      start_value: 320,
      target_value: 500,
      current_value: 410,
      unit: "teams",
      progress: 0.5,
      expected: 0.7,
    }),
    description: "",
    project_list: [],
    hidden_projects: 0,
    subgoal_list: [],
    checkins: [],
  })

  it("says how far it got against its time", () => {
    goalHook.goal = detail()
    render(<GoalPage goalId="g1" />)
    expect(screen.getByText("50%")).toBeTruthy()
    expect(screen.getByText("410 teams, from 320 to 500 teams")).toBeTruthy()
    expect(screen.getByText("20 points behind its time")).toBeTruthy()
  })

  it("checks in with the number moved, or closes the goal", async () => {
    goalHook.goal = detail()
    render(<GoalPage goalId="g1" />)
    fireEvent.click(screen.getAllByRole("button", { name: "Check in" })[0])
    await waitFor(() => expect((screen.getByLabelText(/Drafted from what serves the goal/) as HTMLTextAreaElement).value).toContain("Now at 410 teams"))
    const value = screen.getByLabelText("Where the number is now") as HTMLInputElement
    expect(value.value).toBe("410")
    fireEvent.change(value, { target: { value: "430" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Check in" })))
    expect(goalHook.postCheckIn).toHaveBeenCalledWith(expect.objectContaining({ health: "at_risk", value: 430 }))
    expect(goalHook.postCheckIn.mock.calls[0][0]).not.toHaveProperty("shared_with_client")

    goalHook.postCheckIn.mockClear()
    cleanup()
    render(<GoalPage goalId="g1" />)
    fireEvent.click(screen.getAllByRole("button", { name: "Check in" })[0])
    await waitFor(() => expect(screen.getByRole("radio", { name: /Achieved/ })).toBeTruthy())
    fireEvent.click(screen.getByRole("radio", { name: /Achieved/ }))
    // Closing takes no number: it keeps where the goal ended.
    expect(screen.queryByLabelText("Where the number is now")).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Close the goal" })))
    expect(goalHook.postCheckIn).toHaveBeenCalledWith(expect.objectContaining({ health: "achieved" }))
    expect(goalHook.postCheckIn.mock.calls[0][0]).not.toHaveProperty("value")
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Goal closed" }))
  })
})

describe("a number goal's check-in", () => {
  it("sends no value it didn't change, even when the goal moved meanwhile, and none when closing", async () => {
    const { UpdateComposer } = await import("@/components/projectUpdates/UpdateComposer")
    const post = vi.fn().mockResolvedValue({})
    const props = {
      subject: "goal" as const,
      hasAI: false,
      endings: true,
      draft: vi.fn().mockResolvedValue({ text: "Now at 410 teams.", health: "on_track" }),
      aiDraft: vi.fn(),
      post,
      edit: vi.fn(),
      onDone: vi.fn(),
    }
    const { rerender } = render(<UpdateComposer {...props} number={{ current: 410, unit: "teams" }} />)
    await waitFor(() => expect((screen.getByLabelText(/Drafted from what serves the goal/) as HTMLTextAreaElement).value).toBe("Now at 410 teams."))
    // Someone else moved it to 450 while this was open; the field wasn't touched.
    rerender(<UpdateComposer {...props} number={{ current: 450, unit: "teams" }} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Check in" })))
    expect(post.mock.calls[0][0]).not.toHaveProperty("value")
    expect(screen.getByText("Everyone in the workspace can read check-ins.")).toBeTruthy()

    cleanup()
    post.mockClear()
    render(<UpdateComposer {...props} number={{ current: 410, unit: "teams" }} />)
    await waitFor(() => expect(screen.getByLabelText("Where the number is now")).toBeTruthy())
    fireEvent.change(screen.getByLabelText("Where the number is now"), { target: { value: "9999" } })
    fireEvent.click(screen.getByRole("radio", { name: /Dropped/ }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Close the goal" })))
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ health: "dropped" }))
    expect(post.mock.calls[0][0]).not.toHaveProperty("value")
  })
})

describe("a goal's owner", () => {
  it("without a photo, wears their own colour, as everywhere else they appear", async () => {
    const { GoalOwner } = await import("@/components/goals/GoalOwner")
    const { hueFor } = await import("@/lib/campHue")
    const { HUE_CLASS } = await import("@/components/ui/graphics/hues")
    render(<GoalOwner owner={{ user_uuid: "u1", user_full_name: "Maya Chen" }} />)
    const initials = screen.getByText("MC")
    expect(initials.className).toContain(HUE_CLASS[hueFor("Maya Chen")])
    expect(initials.className).toContain("bg-hue-tint")
  })
})
