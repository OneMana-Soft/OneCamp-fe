import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"

// The desktop project header folds its tools into one "⋯" menu. Every action
// it used to show as an icon must still be reachable, by name.

const dispatched: Array<{ type: string; payload?: { key?: string; data?: { title?: string; description?: string; confirmText?: string; destructive?: boolean; onConfirm?: () => unknown } } }> = []
// The project's SLA settings read (linear-24 W2): each call's `when` is kept, and the read comes back (a member's)
// only with slaRead; otherwise it is refused (a guest's 403), so most tests see no SLA entry.
const slaAsked: boolean[] = []
let slaRead = false
vi.mock("@/hooks/useSlaView", () => ({
  useSlaView: (_project: string, when: boolean) => (slaAsked.push(when), { shows: false, read: when && slaRead, refused: when && !slaRead }),
}))
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
vi.mock("@/components/project/ProjectAccessDialog", () => ({ ProjectAccessDialog: shown("access") }))
// The project's links (basecamp-16): the Links tool opens with the list its home reads, none here.
vi.mock("@/hooks/useProjectLinks", () => ({ useProjectLinks: () => ({ links: [] }) }))
vi.mock("@/components/project/ProjectLinksDialog", () => ({ ProjectLinksDialog: () => <div data-testid="links" /> }))

// Later (linear-45 #1): the member's own list, and its one picker, loaded on the click.
let laterSaved: { id: string } | undefined
const laterSave = vi.fn((input: unknown) => Promise.resolve(input))
const laterRemove = vi.fn(() => Promise.resolve())
vi.mock("@/hooks/useLater", () => ({
  useSavedEntry: () => laterSaved,
  useLaterActions: () => ({ save: laterSave, remind: vi.fn(), done: vi.fn(), remove: laterRemove }),
}))
const PICKED = new Date("2026-10-16T03:30:00Z")
vi.mock("@/components/later/reminderPicker", () => ({
  default: ({ onPick }: { onPick: (at: Date) => void }) => (
    <div role="dialog" aria-label="Remind me"><button type="button" onClick={() => onPick(PICKED)}>Set reminder</button></div>
  ),
}))

const { ProjectActionsMenu } = await import("@/components/project/ProjectToolButtons")
const { GetEndpointUrl } = await import("@/services/endPoints")

afterEach(cleanup)
// Later's picked moment is a date: the file runs on the one test clock.
pinTestClock()

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
    // A member's menu holds the project's rules, which they read (package 9).
    openMenu()
    expect(screen.getByRole("menuitem", { name: "Rules that run work" })).toBeTruthy()
    expect(screen.queryByRole("menuitem", { name: "Intake forms" })).toBeNull()
    // And its links, which every member opens; the server lets only its admins change them (basecamp-16).
    fireEvent.click(screen.getByRole("menuitem", { name: "Links" }))
    expect(await screen.findByTestId("links")).toBeTruthy()
  })

  it("lists every admin action by name, and each one does what it says", async () => {
    const onRename = vi.fn()
    const onMembers = vi.fn()
    render(<ProjectActionsMenu projectId="q4-1" isAdmin isMember onRename={onRename} onMembers={onMembers} />)
    openMenu()
    for (const name of ["Intake forms", "Save as a template", "Who can change tasks", "Edit project name", "Manage project members"]) {
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
    openMenu()
    expect(screen.queryByRole("menuitem", { name: /Archive/ })).toBeNull()
  })

  it("shows nothing to someone outside the project", () => {
    const { container } = render(<ProjectActionsMenu projectId="q4-1" isAdmin={false} isMember={false} onRename={() => {}} onMembers={() => {}} />)
    expect(container.innerHTML).toBe("")
  })

  it("opens who can change tasks from the menu", async () => {
    render(<ProjectActionsMenu projectId="q4-1" isAdmin isMember onRename={() => {}} onMembers={() => {}} />)
    openMenu()
    fireEvent.click(screen.getByRole("menuitem", { name: "Who can change tasks" }))
    expect(await screen.findByTestId("access")).toBeTruthy()
  })

  // Its team's admin manages its people and archives it without running it
  // (Work Access): one who only views the project is offered those two, and
  // none of its settings.
  it("offers its team's admin the people and archiving, not its settings", () => {
    const steward = {
      role: "viewer" as const, view: true, comment: false, create_tasks: false, edit_tasks: "none" as const, delete_tasks: "none" as const,
      log_time: false, post_updates: false, add_files: false, manage: false, manage_people: true, archive: true,
    }
    render(<ProjectActionsMenu projectId="q4-1" isAdmin={false} isMember access={steward} onRename={() => {}} onMembers={() => {}} />)
    openMenu()
    expect(screen.getByRole("menuitem", { name: "Manage project members" })).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "Archive project…" })).toBeTruthy()
    for (const name of ["Edit project name", "Who can change tasks", "Intake forms"]) {
      expect(screen.queryByRole("menuitem", { name })).toBeNull()
    }
  })

  // A project is saved for Later, and reminded about, from its own menu
  // (linear-45 #1), by whoever sees its tools: the entry is their own.
  it("saves the project for Later, and reminds its member about it at a time picked", async () => {
    render(<ProjectActionsMenu projectId="q4-1" projectName="Q4 launch" isAdmin={false} isMember onRename={() => {}} onMembers={() => {}} />)
    openMenu()
    fireEvent.click(screen.getByRole("menuitem", { name: "Save for later" }))
    expect(laterSave).toHaveBeenCalledWith(expect.objectContaining({ item_type: "project", item_id: "q4-1", link: "/app/project/q4-1", title: "Q4 launch", remind_at: null }))
    openMenu()
    fireEvent.click(screen.getByRole("menuitem", { name: "Remind me…" }))
    fireEvent.click(await screen.findByRole("button", { name: "Set reminder" }))
    expect(laterSave).toHaveBeenLastCalledWith(expect.objectContaining({ item_type: "project", item_id: "q4-1", remind_at: PICKED.toISOString() }))
    laterSave.mockClear()
  })

  it("says the project is saved, and takes it out of Later", () => {
    laterSaved = { id: "l9" }
    render(<ProjectActionsMenu projectId="q4-1" projectName="Q4 launch" isAdmin={false} isMember onRename={() => {}} onMembers={() => {}} />)
    openMenu()
    fireEvent.click(screen.getByRole("menuitem", { name: "Saved for later" }))
    expect(laterRemove).toHaveBeenCalledWith("l9")
    laterSaved = undefined
  })
})

describe("the SLAs entry in the project's actions (linear-24 W2, CR-346 F1)", () => {
  beforeEach(() => {
    slaAsked.length = 0
    slaRead = false
  })

  it("the project's first load asks nothing about SLAs: opening its actions asks, and a member is offered the entry", () => {
    slaRead = true
    render(<ProjectActionsMenu projectId="q4-1" isAdmin={false} isMember onRename={() => {}} onMembers={() => {}} />)
    expect(slaAsked.length).toBeGreaterThan(0)
    expect(slaAsked.some(Boolean)).toBe(false)
    openMenu()
    expect(slaAsked.at(-1)).toBe(true)
    expect(screen.getByRole("menuitem", { name: "SLAs" })).toBeTruthy()
  })

  it("a guest, whose read is refused, is offered no SLAs entry with its actions open (V-1011)", () => {
    render(<ProjectActionsMenu projectId="q4-1" isAdmin={false} isMember onRename={() => {}} onMembers={() => {}} />)
    openMenu()
    expect(slaAsked.at(-1)).toBe(true)
    expect(screen.getByRole("menuitem", { name: "Rules that run work" })).toBeTruthy()
    expect(screen.queryByRole("menuitem", { name: "SLAs" })).toBeNull()
  })
})
