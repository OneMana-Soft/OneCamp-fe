import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { GoalDetail, GoalSummary } from "@/lib/goals"

// The goals list and a goal's page, with the server's answers stood in.

const pushed: string[] = []
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: (u: string) => pushed.push(u) }), usePathname: () => "/app/goals/g1", useSearchParams: () => new URLSearchParams() }))
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
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))

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
let goalsLoading = false
const goalHook = {
  goal: undefined as GoalDetail | undefined,
  postCheckIn: vi.fn().mockResolvedValue({ checkin: { id: "c1" } }),
  draft: vi.fn().mockResolvedValue({ text: "Now at 410 teams: 50% of the way.", health: "at_risk" }),
}
vi.mock("@/hooks/useGoals", () => ({
  useGoals: () => ({ goals: goalsLoading ? undefined : list, isLoading: goalsLoading, isError: false, create: vi.fn(), refresh: vi.fn() }),
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
const { DocumentTitle } = await import("@/components/common/DocumentTitle")

afterEach(() => {
  cleanup()
  localStorage.clear()
  toast.mockReset()
  goalsLoading = false
})

describe("the goals list", () => {
  it("holds the list's place while the goals are read: rows a goal row high, on a desk and on a phone", () => {
    goalsLoading = true
    const { unmount } = render(<GoalsView compact={false} />)
    const desk = screen.getByRole("status", { name: "Loading goals" })
    expect(desk.children).toHaveLength(6)
    expect(desk.children[0].className).toContain("h-8")
    expect(desk.children[1].className).toContain("h-14")
    unmount()
    render(<GoalsView compact />)
    expect(screen.getByRole("status", { name: "Loading goals" }).children[0].className).toContain("h-16")
  })

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
    expect(screen.getAllByRole("progressbar").some((b) => b.getAttribute("aria-label")?.includes("with 50% of its time gone"))).toBe(true)
    // Each row leads with its ring (design v3, W42), and a sub-goal has its elbow.
    expect(rows[0].querySelector("[role=progressbar] svg")).not.toBeNull()
    expect(rows[1].querySelector("[data-goal-elbow]")).not.toBeNull()

    // Status is a filter in the toolbar's language now, with a chip for what is chosen.
    fireEvent.click(screen.getByRole("button", { name: "Filter" }))
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Closed/ }))
    expect(screen.getByText("Old goal")).toBeTruthy()
    expect(screen.queryByText("Reach 500 teams")).toBeNull()
    expect(screen.getByText("Closed goals")).toBeTruthy()
    // A closed goal shows how it ended, not a ring.
    expect(screen.getAllByRole("row")[1].querySelector("[data-status-glyph='cancelled']")).not.toBeNull()
  })

  it("says how far ahead or behind a goal is, in words with their unit, as its page does (PTC-35)", () => {
    list = [summary("Ahead", { progress: 0.73, expected: 0.5 }), summary("Behind", { progress: 0.42, expected: 0.5 })]
    render(<GoalsView compact={false} />)
    expect(screen.getByText("23 points ahead").className).toContain("text-camp-moss-ink")
    expect(screen.getByText("8 points behind").className).toContain("text-danger-ink")
  })

  it("says the health is from the last check-in, beside a pace that may differ (PTC-36)", () => {
    list = [summary("Reach 500", { progress: 0.61, expected: 0.5, health: "at_risk", checked_in_at: new Date().toISOString() })]
    const { container } = render(<GoalsView compact={false} />)
    expect(container.querySelector("[data-health-from='check-in']")?.getAttribute("title")).toBe("Health is from the last check-in")
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
    // The empty state's spot, in Projects' moss (lib/areas, v3.1).
    expect(container.querySelector("[data-empty-illustration] svg.hue-moss")).toBeTruthy()
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

  it("names the browser tab after the goal (PTC-38)", () => {
    goalHook.goal = detail()
    render(
      <>
        <DocumentTitle />
        <GoalPage goalId="g1" />
      </>,
    )
    expect(document.title).toBe("Reach 500 paying teams · OneCamp")
  })

  it("says how far it got against its time", () => {
    goalHook.goal = detail()
    render(<GoalPage goalId="g1" />)
    expect(screen.getByText("50%")).toBeTruthy()
    expect(screen.getByText("410 teams, from 320 to 500 teams")).toBeTruthy()
    expect(screen.getByText("20 points behind its time")).toBeTruthy()
    // The hero (design v3, W43): a 96 px ring, and no sparkline before two check-ins.
    const hero = document.querySelector("[data-goal-hero]")!
    expect(hero.querySelector("[role=progressbar][style*='width: 96px']")).not.toBeNull()
    expect(hero.querySelector("[data-pace-tick]")).not.toBeNull()
    expect(document.querySelector("[data-goal-sparkline]")).toBeNull()
  })

  it("draws its check-ins as a line once there are two, and lists them on a rail", () => {
    const at = (d: string) => `2026-10-0${d}T10:00:00Z`
    goalHook.goal = {
      ...detail(),
      checkins: [
        { id: "c2", goal_id: "g1", author_uuid: "me", author_name: "Sam Rivera", health: "on_track", body: "Up again.", value: 410, created_at: at("8"), updated_at: at("8") },
        { id: "c1", goal_id: "g1", author_uuid: "me", author_name: "Sam Rivera", health: "at_risk", body: "Slow week.", value: 380, created_at: at("1"), updated_at: at("1") },
      ],
    }
    render(<GoalPage goalId="g1" />)
    expect(document.querySelector("[data-goal-sparkline]")).not.toBeNull()
    expect(document.querySelector("[data-checkin-rail]")!.children).toHaveLength(2)
    expect(screen.getByText("380 → 410 teams")).toBeTruthy()
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
    // The draft opens under a line of its own for typing (PTC-23), as a project update's does.
    await waitFor(() => expect((screen.getByLabelText(/Drafted from what serves the goal/) as HTMLTextAreaElement).value).toBe("\n\nNow at 410 teams."))
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
    expect(initials.className).toContain("avatar-person")
  })
})

// PTC-37: a new goal's dates were browser date inputs (mm/dd/yyyy in a US
// browser), unlike every other date in the app.
describe("a goal's dates", () => {
  it("are picked with the app's date picker, named for what they are", async () => {
    const { GoalDialog } = await import("@/components/goals/GoalDialog")
    const { container } = render(<GoalDialog goals={[]} onClose={() => {}} onSaved={() => {}} />)
    expect(container.ownerDocument.querySelector("input[type=date]")).toBeNull()
    expect(screen.getByRole("button", { name: /^Due: / })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Starts: none" })).toBeTruthy()
  })
})
