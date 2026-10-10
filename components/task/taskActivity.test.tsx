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
