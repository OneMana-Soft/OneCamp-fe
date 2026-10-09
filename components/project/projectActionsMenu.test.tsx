import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// The desktop project header folds its tools into one "⋯" menu. Every action
// it used to show as an icon must still be reachable, by name.

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/app/project/q4-1",
}))
const shown = (name: string) => ({ open }: { open: boolean }) => (open ? <div data-testid={name} /> : null)
vi.mock("@/components/project/ProjectTimeDialog", () => ({ ProjectTimeDialog: shown("time") }))
vi.mock("@/components/project/ProjectFormsDialog", () => ({ ProjectFormsDialog: shown("forms") }))
vi.mock("@/components/project/ProjectShareDialog", () => ({ ProjectShareDialog: shown("share") }))
vi.mock("@/components/projectTemplates/SaveAsTemplateDialog", () => ({ SaveAsTemplateDialog: shown("template") }))

const { ProjectActionsMenu } = await import("@/components/project/ProjectToolButtons")

afterEach(cleanup)

function openMenu() {
  const trigger = screen.getByRole("button", { name: "Project actions" })
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" })
  fireEvent.keyDown(trigger, { key: "Enter" })
}

describe("the project header's actions", () => {
  it("keeps the project's time as a button of its own", () => {
    render(<ProjectActionsMenu projectId="q4-1" isAdmin={false} isMember onRename={() => {}} onMembers={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Time logged on this project" }))
    expect(screen.getByTestId("time")).toBeTruthy()
    // A member has nothing else to do here, so there is no empty menu.
    expect(screen.queryByRole("button", { name: "Project actions" })).toBeNull()
  })

  it("lists every admin action by name, and each one does what it says", () => {
    const onRename = vi.fn()
    const onMembers = vi.fn()
    render(<ProjectActionsMenu projectId="q4-1" isAdmin isMember onRename={onRename} onMembers={onMembers} />)
    openMenu()
    for (const name of ["Forms that make tasks", "Share with a client", "Save as a template", "Edit project name", "Manage project members"]) {
      expect(screen.getByRole("menuitem", { name })).toBeTruthy()
    }
    fireEvent.click(screen.getByRole("menuitem", { name: "Share with a client" }))
    expect(screen.getByTestId("share")).toBeTruthy()

    openMenu()
    fireEvent.click(screen.getByRole("menuitem", { name: "Manage project members" }))
    expect(onMembers).toHaveBeenCalled()
    openMenu()
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit project name" }))
    expect(onRename).toHaveBeenCalled()
  })

  it("shows nothing to someone outside the project", () => {
    const { container } = render(<ProjectActionsMenu projectId="q4-1" isAdmin={false} isMember={false} onRename={() => {}} onMembers={() => {}} />)
    expect(container.innerHTML).toBe("")
  })
})
