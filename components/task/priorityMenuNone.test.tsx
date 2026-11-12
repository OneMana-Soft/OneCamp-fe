import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { priorities } from "@/types/table"

// UX-PROJECTS-H1 (PROJECTS-14): No priority is a real choice. The composer's
// and the task page's priority menu offered only Low to Urgent, so a priority
// once picked could never be taken off there (the row menu and the bulk bar
// could).

vi.mock("@/lib/utils/i18n", () => ({ useTranslation: () => ({ t: (k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? k }), useWord: (_key: string, fallback: string) => fallback }))
const { PriorityMenuContent } = await import("@/components/task/StatusMenu")
const { TaskStatusPriorityControl } = await import("@/components/task/taskStatusPriorityControl")
const { BUILT_IN_STATUSES } = await import("@/lib/taskStatus")

/** A priority's word, as TaskPriorityCell draws it after its glyph. */
const wordOf = (el: HTMLElement) => el.querySelector<HTMLElement>("[data-priority-level] > span")!

afterEach(cleanup)

describe("the priority menu", () => {
  it("offers No priority, last, and picks none with it", () => {
    const onSelect = vi.fn()
    render(<PriorityMenuContent current="high" onSelect={onSelect} />)
    const rows = screen.getAllByRole("option")
    expect(rows.map((r) => r.textContent?.replace(/\d+$/, ""))).toEqual(["Low", "Medium", "High", "Urgent", "No priority"])
    fireEvent.click(rows[4])
    expect(onSelect).toHaveBeenCalledWith("")
  })

  // F1 of 3ef857030: No priority read as a disabled row (ink-3 beside the
  // others' ink), though it is a live choice, and in the composer the checked
  // one. In a picker its word takes the rows' ink; its empty bars mark it none.
  it("draws No priority's word in the other rows' ink, its empty bars the mark", () => {
    render(<PriorityMenuContent current="" onSelect={() => {}} />)
    const rows = screen.getAllByRole("option")
    const none = rows[4]
    for (const row of rows.slice(0, 4)) expect(wordOf(none).className).toBe(wordOf(row).className)
    expect(none.querySelector("[data-priority-glyph]")?.getAttribute("data-priority-glyph")).toBe("0")
  })
})

describe("a field's priority", () => {
  // A value that is unset stays quiet (the review kept it): the task page's field.
  it("says No priority in the quiet ink on the task page, and a priority in the field's ink", () => {
    const field = (priority?: (typeof priorities)[number]) =>
      render(<TaskStatusPriorityControl isAdmin selectedStatus={BUILT_IN_STATUSES[0]} selectedPriority={priority} onSelectStatus={() => {}} onSelectPriority={() => {}} />)
    field()
    expect(wordOf(screen.getByRole("button", { name: /^Priority: none/ })).closest(".text-ink-3")).not.toBeNull()
    cleanup()
    field(priorities.find((p) => p.value === "high"))
    expect(wordOf(screen.getByRole("button", { name: /^Priority: High/ })).closest(".text-ink-3")).toBeNull()
  })
})
