import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import en from "@/lib/utils/i18n/locales/en/en.json"

vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string, o?: { field?: string }) => (en as Record<string, string>)[k]?.replace("{{field}}", o?.field ?? "") ?? k }) }))
const { default: TaskActivity } = await import("@/components/task/taskActivity")

const row = (activity_type: string, next = "") =>
  render(
    <TaskActivity
      openOtherUserProfile={() => {}}
      taskActivity={{ activity_type, activity_next_state: next, activity_time: "2026-10-10T06:49:00Z", activity_by: { user_uuid: "u", user_name: "Sam Rivera" } } as never}
    />,
  )

describe("a task's activity", () => {
  it("reads as a sentence after the name, in its own words", () => {
    // It read "Sam Rivera Create task." (the button's label) and "Sam Rivera Changed Channel."
    row("taskCreate")
    expect(screen.getByText(/created the task\./)).toBeTruthy()
    row("fieldUpdate", "Channel")
    expect(screen.getByText(/changed Channel\./)).toBeTruthy()
  })

  it("has every empty state's words in English, so none is a humanised key", () => {
    for (const k of ["noTasksAssigned", "noTasksMatch", "activityCreatedTask"]) expect((en as Record<string, string>)[k], k).toBeTruthy()
    expect((en as Record<string, string>).myTasks).toBe("My tasks")
  })
})

const { collapseHistory, changedList, buildStream } = await import("@/lib/tasks/activityStream")

describe("the activity stream (design v3, W32)", () => {
  const sam = { user_uuid: "sam", user_name: "Sam" }
  const maya = { user_uuid: "maya", user_name: "Maya" }
  const a = (type: string, at: string, by = sam) => ({ activity_type: type, activity_time: at, activity_by: by, activity_prev_state: "", activity_next_state: "" }) as never

  it("folds one person's changes within five minutes into one line", () => {
    const lines = collapseHistory([
      a("statusUpdate", "2026-10-10T10:00:00Z"),
      a("priorityUpdate", "2026-10-10T10:02:00Z"),
      a("endDateUpdate", "2026-10-10T10:04:00Z"),
      a("statusUpdate", "2026-10-10T10:20:00Z"),
      a("priorityUpdate", "2026-10-10T10:21:00Z", maya),
    ])
    expect(lines).toHaveLength(3)
    expect(changedList(lines[0])).toBe("status, priority and due date")
    expect(lines[1].changes).toHaveLength(1)
    expect(lines[2].first.activity_by.user_uuid).toBe("maya")
  })

  it("never folds an event that isn't a field change, and leaves out comment history", () => {
    const lines = collapseHistory([a("taskCreate", "2026-10-10T10:00:00Z"), a("statusUpdate", "2026-10-10T10:01:00Z"), a("commentAdd", "2026-10-10T10:02:00Z")])
    expect(lines.map((l) => l.changes.length)).toEqual([1, 1])
  })

  it("interleaves history with runs of comments in time order", () => {
    const lines = collapseHistory([a("taskCreate", "2026-10-10T09:00:00Z"), a("statusUpdate", "2026-10-10T11:00:00Z")])
    const items = buildStream(lines, [{ comment_created_at: "2026-10-10T10:00:00Z" }, { comment_created_at: "2026-10-10T10:30:00Z" }, { comment_created_at: "2026-10-10T12:00:00Z" }])
    expect(items.map((i) => (i.kind === "comments" ? `c${i.start}-${i.end}` : "h"))).toEqual(["h", "c0-2", "h", "c2-3"])
  })

  it("writes a folded line as one sentence", () => {
    const lines = collapseHistory([a("statusUpdate", "2026-10-10T10:00:00Z"), a("priorityUpdate", "2026-10-10T10:02:00Z")])
    render(<TaskActivity openOtherUserProfile={() => {}} taskActivity={lines[0].first} line={lines[0]} />)
    expect(screen.getByText(/changed status and priority/)).toBeTruthy()
  })
})
