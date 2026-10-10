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
