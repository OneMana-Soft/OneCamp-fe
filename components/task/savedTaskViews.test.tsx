import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

const save = vi.fn(async () => null)
vi.mock("@/hooks/useTaskViews", () => ({ useTaskViews: () => ({ views: [], isLoading: false, save, remove: vi.fn(), busy: false }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

const { SavedTaskViewsPanel } = await import("./savedTaskViews")
import type { TaskViewState } from "@/lib/tasks/views"

afterEach(cleanup)

// The phone's filter sheets hold this panel inside their own form: naming a
// view submitted that one too, which applied the filters and closed the sheet.
describe("a saved view's name, inside a filter form", () => {
  it("saves the view and leaves the filter form alone", async () => {
    const filters = vi.fn((e: React.FormEvent) => e.preventDefault())
    render(
      <form onSubmit={filters}>
        <SavedTaskViewsPanel scope="me" current={{} as TaskViewState} apply={() => {}} withColumns={false} />
      </form>,
    )
    fireEvent.change(screen.getByRole("textbox", { name: "View name" }), { target: { value: "Due this week" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await vi.waitFor(() => expect(save).toHaveBeenCalledWith("Due this week", {}))
    expect(filters).not.toHaveBeenCalled()
  })
})
