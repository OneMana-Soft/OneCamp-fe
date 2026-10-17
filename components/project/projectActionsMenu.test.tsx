import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// The desktop project header folds its tools into one "⋯" menu. Every action
// it used to show as an icon must still be reachable, by name.

const dispatched: Array<{ type: string; payload?: { key?: string; data?: { title?: string; description?: string; confirmText?: string; destructive?: boolean; onConfirm?: () => unknown } } }> = []
vi.mock("react-redux", () => ({ useDispatch: () => (a: (typeof dispatched)[number]) => void dispatched.push(a), useSelector: () => undefined }))
// The cache keys read again after a change, as the app's mutate is asked.
const reread: unknown[] = []
vi.mock("@/lib/swrMutate", () => ({ appMutate: (key: unknown) => (reread.push(key), Promise.resolve()) }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(() => Promise.resolve({})), isSubmitting: false }) }))
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/app/project/q4-1",
}))
const shown = (name: string) => ({ open }: { open: boolean }) => (open ? <div data-testid={name} /> : null)
vi.mock("@/components/project/ProjectTimeDialog", () => ({ ProjectTimeDialog: shown("time") }))
vi.mock("@/components/project/ProjectFormsDialog", () => ({ ProjectFormsDialog: shown("forms") }))
vi.mock("@/components/project/ProjectShareDialog", () => ({ ProjectShareDialog: shown("share") }))
vi.mock("@/components/projectTemplates/SaveAsTemplateDialog", () => ({ SaveAsTemplateDialog: shown("template") }))

const { ProjectActionsMenu } = await import("@/components/project/ProjectToolButtons")
const { GetEndpointUrl } = await import("@/services/endPoints")

afterEach(cleanup)

function openMenu() {
  const trigger = screen.getByRole("button", { name: "Project actions" })
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" })
  fireEvent.keyDown(trigger, { key: "Enter" })
}

describe("the project header's actions", () => {
  it("keeps the project's time as a button of its own", async () => {
    render(<ProjectActionsMenu projectId="q4-1" isAdmin={false} isMember onRename={() => {}} onMembers={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Time logged on this project" }))
    expect(await screen.findByTestId("time")).toBeTruthy()
    // A member has nothing else to do here, so there is no empty menu.
    expect(screen.queryByRole("button", { name: "Project actions" })).toBeNull()
  })

  it("lists every admin action by name, and each one does what it says", async () => {
    const onRename = vi.fn()
    const onMembers = vi.fn()
    render(<ProjectActionsMenu projectId="q4-1" isAdmin isMember onRename={onRename} onMembers={onMembers} />)
    openMenu()
    for (const name of ["Forms that make tasks", "Save as a template", "Edit project name", "Manage project members"]) {
      expect(screen.getByRole("menuitem", { name })).toBeTruthy()
    }
    // Sharing with a client is a word in the header bar (work.md W16), not a menu item.
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    fireEvent.click(screen.getByRole("button", { name: "Share" }))
    expect(await screen.findByTestId("share")).toBeTruthy()

    openMenu()
    fireEvent.click(screen.getByRole("menuitem", { name: "Manage project members" }))
    expect(onMembers).toHaveBeenCalled()
    openMenu()
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit project name" }))
    expect(onRename).toHaveBeenCalled()
  })

  it("archives the project from its own menu, last, after one question (PTC-13)", () => {
    dispatched.length = 0
    render(<ProjectActionsMenu projectId="q4-1" projectName="Q4 launch" isAdmin isMember onRename={() => {}} onMembers={() => {}} />)
    openMenu()
    const items = screen.getAllByRole("menuitem").map((i) => i.textContent)
    expect(items.at(-1)).toBe("Archive project…")
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive project…" }))
    const asked = dispatched.find((a) => a.payload?.key === "confirmAlert")?.payload?.data
    expect(asked).toMatchObject({ title: "Archive project", confirmText: "Archive project", destructive: true })
    expect(asked?.description).toMatch(/^Archive Q4 launch\? Its members lose access until it is restored\./)
  })

  it("offers Restore project for an archived project, in sentence case (PTC-55)", () => {
    dispatched.length = 0
    render(<ProjectActionsMenu projectId="q4-1" projectName="Q4 launch" isAdmin isMember archived onRename={() => {}} onMembers={() => {}} />)
    openMenu()
    expect(screen.queryByRole("menuitem", { name: "Archive project…" })).toBeNull()
    fireEvent.click(screen.getByRole("menuitem", { name: "Restore project" }))
    expect(dispatched.find((a) => a.payload?.key === "confirmAlert")?.payload?.data).toMatchObject({ title: "Restore project", confirmText: "Restore project" })
  })

  // The page reads its archived state from the project's own answer: once
  // restored, that answer is read again, or the menu went on offering
  // Restore project for a project that was back.
  it("reads the project again once it is restored", async () => {
    dispatched.length = 0
    reread.length = 0
    render(<ProjectActionsMenu projectId="q4-1" projectName="Q4 launch" isAdmin isMember archived onRename={() => {}} onMembers={() => {}} />)
    openMenu()
    fireEvent.click(screen.getByRole("menuitem", { name: "Restore project" }))
    const asked = dispatched.find((a) => a.payload?.key === "confirmAlert")?.payload?.data
    await asked?.onConfirm?.()
    expect(reread).toContain(`${GetEndpointUrl.GetProjectInfo}/q4-1`)
  })

  it("offers no archive to a member who isn't an admin", () => {
    render(<ProjectActionsMenu projectId="q4-1" isAdmin={false} isMember onRename={() => {}} onMembers={() => {}} />)
    expect(screen.queryByRole("button", { name: "Project actions" })).toBeNull()
  })

  it("shows nothing to someone outside the project", () => {
    const { container } = render(<ProjectActionsMenu projectId="q4-1" isAdmin={false} isMember={false} onRename={() => {}} onMembers={() => {}} />)
    expect(container.innerHTML).toBe("")
  })
})
