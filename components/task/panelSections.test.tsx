import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createRef } from "react"

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/components/project/projectAttachment", () => ({ default: () => null }))
vi.mock("@/components/task/taskSubTaskAssignee", () => ({ default: () => null }))

const { SubtasksSection } = await import("@/components/task/subtasksSection")
const { TaskAttachmentsSection } = await import("@/components/task/taskAttachmentsSection")

afterEach(cleanup)

const noop = () => {}
const subtasks = (isAdmin: boolean) => (
  <SubtasksSection
    isAdmin={isAdmin}
    subtasks={[]}
    projectMembers={[]}
    onToggleStatus={noop}
    onRename={noop}
    onUpdateStart={noop}
    onUpdateDue={noop}
    onUpdateAssignee={noop}
    onOpen={noop}
    onCreateSubtask={noop}
  />
)

describe("the panel's sections", () => {
  it("adds a subtask from a real button, which someone who can't edit doesn't see", () => {
    render(subtasks(true))
    const add = screen.getByRole("button", { name: "Add subtask" })
    expect(add.tagName).toBe("BUTTON")
    fireEvent.click(add)
    expect(screen.getByPlaceholderText(/subtask name/i)).toBeTruthy()
    cleanup()
    render(subtasks(false))
    expect(screen.queryByRole("button", { name: "Add subtask" })).toBeNull()
  })

  it("attaches a file from a button the keyboard reaches, which opens the file picker", () => {
    const ref = createRef<HTMLInputElement>()
    render(
      <TaskAttachmentsSection
        isAdmin
        attachments={[]}
        previewFiles={[]}
        projectUUID="p"
        fileInputRef={ref}
        onFileSelect={noop}
        onRemoveAttachment={noop}
        onAttachmentClick={noop}
        onRemovePreview={noop}
      />,
    )
    const click = vi.spyOn(ref.current!, "click")
    fireEvent.click(screen.getByRole("button", { name: "Attach a file" }))
    expect(click).toHaveBeenCalled()
  })

  it("shows no Attachments section to someone who can't add one when there are none", () => {
    const { container } = render(
      <TaskAttachmentsSection
        isAdmin={false}
        attachments={[]}
        previewFiles={[]}
        projectUUID="p"
        fileInputRef={createRef()}
        onFileSelect={noop}
        onRemoveAttachment={noop}
        onAttachmentClick={noop}
        onRemovePreview={noop}
      />,
    )
    expect(container.textContent).toBe("")
  })
})

const { MoreFields, pastFirstLine } = await import("@/components/task/panelParts")
const { readFileSync } = await import("node:fs")

describe("the panel's properties (design v3, W29)", () => {
  const panel = readFileSync("components/rightPanel/taskInfoPanel.tsx", "utf8")

  it("shows six properties first, in order, then More fields", () => {
    const order = ["<TaskStatusPriorityControl", "<TaskAssigneePicker", "<DatesProperty", "<TaskEstimateField", 'data-property="labels"', "<MoreFields>"]
    const at = order.map((s) => panel.indexOf(s))
    for (const i of at) expect(i).toBeGreaterThan(-1)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    // Repeat, Cycle and the project's own fields are behind More fields.
    const more = panel.slice(panel.indexOf("<MoreFields>"), panel.indexOf("</MoreFields>"))
    for (const f of ["<TaskRepeatField", "<TaskCycleField", "<TaskFieldsSection"]) expect(more).toContain(f)
  })

  it("folds away only empty fields, and remembers the choice", () => {
    window.localStorage.removeItem("oc_task_more_fields")
    render(
      <MoreFields>
        <div data-field-empty="">
          <span>Repeat</span>
        </div>
        <div>
          <span>Cycle</span>
        </div>
      </MoreFields>,
    )
    // The field's own row (the toggle names it too).
    const repeat = screen.getAllByText("Repeat").find((el) => !el.closest("button"))!.parentElement!
    const box = repeat.parentElement!
    expect(box.className).toContain("[&_[data-field-empty]]:hidden")
    expect(screen.getByText("Cycle")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /more fields/i }))
    expect(box.className).not.toContain("[&_[data-field-empty]]:hidden")
    expect(window.localStorage.getItem("oc_task_more_fields")).toBe("1")
  })

  // design-23: "More fields · Repeat, Channel, Budget, Revi…" ended mid-word.
  it("counts the names a row has no room for: those its wrap puts past the first line", () => {
    expect(pastFirstLine([0, 0, 0, 18, 18])).toBe(2)
    expect(pastFirstLine([4, 4])).toBe(0)
    expect(pastFirstLine([])).toBe(0)
  })

  it("names what it folds away in whole words, and counts those with no room as +N", () => {
    window.localStorage.removeItem("oc_task_more_fields")
    const names = ["Repeat", "Channel", "Budget", "Review", "Owner"]
    // The row's layout, stubbed: Review and Owner wrap past its first line.
    const tops = vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function (this: HTMLElement) {
      return /Review|Owner/.test(this.textContent ?? "") ? 16 : 0
    })
    render(
      <MoreFields>
        {names.map((n) => (
          <div key={n} data-field-empty="">
            <span>{n}</span>
          </div>
        ))}
      </MoreFields>,
    )
    const toggle = screen.getByRole("button", { name: /more fields/i })
    expect([...toggle.querySelectorAll("[data-more-name]")].map((n) => n.textContent)).toEqual(["Repeat", ", Channel", ", Budget", ", Review", ", Owner"])
    expect(toggle.querySelector("[data-more-rest]")?.textContent).toBe("+2")
    tops.mockRestore()
  })

  it("draws values as ghost field buttons, never bordered inputs at rest", () => {
    const rows = readFileSync("lib/ui/propertyRow.ts", "utf8")
    expect(rows).toContain("sm:grid-cols-[104px_minmax(0,1fr)]")
    expect(rows).toContain("min-h-8")
    expect(rows).toContain("hover:bg-hover")
    const control = readFileSync("components/task/taskStatusPriorityControl.tsx", "utf8")
    expect(control).toContain("propertyValue")
    expect(control).not.toMatch(/variant="outline"/)
  })
})
