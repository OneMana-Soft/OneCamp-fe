import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { statusOptions, type ProjectStatuses } from "@/lib/taskStatus"

const project: ProjectStatuses = {
  custom: [{ id: "s-qa", name: "QA", category: "inReview", color: "violet", position: 0 }],
  max: 20,
} as unknown as ProjectStatuses
const update = vi.fn().mockResolvedValue(undefined)
const create = vi.fn().mockResolvedValue(undefined)
vi.mock("@/hooks/useProjectStatuses", () => ({
  useProjectStatuses: () => ({ project, options: statusOptions(project), create, update, remove: vi.fn(), reorder: vi.fn() }),
}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

const { ProjectStatusesDialog, hueForCategory } = await import("@/components/project/ProjectStatusesDialog")

afterEach(() => {
  cleanup()
  update.mockClear()
})

describe("a project's statuses (work.md W48)", () => {
  it("has a section per category, each headed by its glyph", () => {
    render(<ProjectStatusesDialog projectId="p1" open onOpenChange={() => {}} />)
    const sections = document.querySelectorAll("[data-status-category]")
    expect(sections.length).toBe(6)
    for (const s of sections) expect(s.querySelector("svg")).not.toBeNull()
  })

  it("previews the workflow, the custom status included", () => {
    render(<ProjectStatusesDialog projectId="p1" open onOpenChange={() => {}} />)
    const strip = screen.getByRole("list", { name: "The workflow" })
    expect(within(strip).getByText("QA")).toBeInTheDocument()
  })

  it("offers only the hues its category allows, and writes the stored name", () => {
    render(<ProjectStatusesDialog projectId="p1" open onOpenChange={() => {}} />)
    const qa = screen.getByDisplayValue("QA").closest("div")!
    fireEvent.click(within(qa).getByRole("button", { name: /^Colour:/ }))
    const names = screen.getAllByRole("option").map((o) => o.getAttribute("aria-label"))
    expect(names).toEqual(["Dusk", "Berry", "Sky", "Lake"])
    fireEvent.click(screen.getByRole("option", { name: "Berry" }))
    expect(update).toHaveBeenCalledWith("s-qa", { name: "QA", category: "inReview", color: "rose" })
  })

  it("drops a colour a new category doesn't allow", () => {
    expect(hueForCategory("violet", "done")).toBe("emerald")
    expect(hueForCategory("teal", "done")).toBe("teal")
    expect(hueForCategory("amber", "backlog")).toBe("slate")
  })
})
