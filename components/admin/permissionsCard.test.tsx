import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

// Member permissions. A failed load left the card blank under its heading,
// beside a toast that soon left, so an admin saw no permissions and nothing to
// do. It now says so, with Try again.
//
// Design v3 (admin A9): the question each row asks is "who", so its control
// is a segmented "Admins · Everyone" named by the permission, not a switch
// with a third line ("All members can") repeating the switch. The note above
// the card says members and agents never exceed their access, with the
// shield in the agent hue. A refused change slides back.

const api = vi.hoisted(() => ({ list: vi.fn(), set: vi.fn() }))
vi.mock("@/services/capabilityService", async (orig) => ({
  ...(await orig<typeof import("@/services/capabilityService")>()),
  listCapabilityPolicies: api.list,
  setCapabilityPolicy: api.set,
}))
vi.mock("@/lib/swrMutate", () => ({ appMutate: vi.fn() }))
const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }))

const { default: PermissionsCard } = await import("./PermissionsCard")

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  api.list.mockReset()
  api.set.mockReset()
})

const radio = (group: HTMLElement, name: string) => within(group).getByRole("radio", { name })

describe("member permissions", () => {
  it("says the permissions couldn't load, and tries again", async () => {
    api.list.mockRejectedValueOnce(new Error("503")).mockResolvedValueOnce([{ capability: "workflow.manage", policy: "admins_only" }])
    render(<PermissionsCard />)
    expect(await screen.findByText(/Couldn't load the member permissions/)).toBeTruthy()
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Try again" })))
    expect(await screen.findAllByRole("radiogroup")).toHaveLength(1)
  })

  it("asks who with a segmented control per permission, and drops the third line", async () => {
    api.list.mockResolvedValue([{ capability: "workflow.manage", policy: "all_members" }])
    render(<PermissionsCard />)
    const group = (await screen.findAllByRole("radiogroup"))[0]
    expect(group.hasAttribute("data-segmented")).toBe(true)
    expect(group.getAttribute("aria-label")).toBeTruthy()
    expect(radio(group, "Everyone").getAttribute("data-state")).toBe("checked")
    expect(radio(group, "Admins").getAttribute("data-state")).toBe("unchecked")
    expect(screen.queryByRole("switch")).toBeNull()
    expect(screen.queryByText("All members can")).toBeNull()
    expect(screen.getByText(/Changes save as you make them\./)).toBeTruthy()
  })

  it("notes members and agents act within their access, with the shield in the agent hue", async () => {
    api.list.mockResolvedValue([])
    render(<PermissionsCard />)
    const note = document.querySelector("[data-permissions-note]") as HTMLElement
    expect(note.textContent).toBe("Members always act within their own access. Agents act within their sponsor's.")
    expect(note.querySelector("svg")?.getAttribute("class")).toMatch(/text-agent-ink/)
  })

  it("saves a choice at once, and slides back when refused", async () => {
    api.list.mockResolvedValue([{ capability: "workflow.manage", policy: "admins_only" }])
    api.set.mockRejectedValue(new Error("refused"))
    render(<PermissionsCard />)
    const group = (await screen.findAllByRole("radiogroup"))[0]
    await act(async () => void fireEvent.click(radio(group, "Everyone")))
    expect(api.set).toHaveBeenCalledWith("workflow.manage", "all_members")
    expect(radio(group, "Admins").getAttribute("data-state")).toBe("checked")
  })

  it("offers a choice back, and Undo saves the one before", async () => {
    api.list.mockResolvedValue([{ capability: "workflow.manage", policy: "admins_only" }])
    api.set.mockResolvedValue(undefined)
    render(<PermissionsCard />)
    const group = (await screen.findAllByRole("radiogroup"))[0]
    await act(async () => void fireEvent.click(radio(group, "Everyone")))
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/: Everyone$/) })))

    const [{ action }] = toast.mock.calls[0] as [{ action: { props: { onClick: () => Promise<void> } } }]
    await act(() => action.props.onClick())
    expect(api.set.mock.calls).toEqual([
      ["workflow.manage", "all_members"],
      ["workflow.manage", "admins_only"],
    ])
    expect(radio(group, "Admins").getAttribute("data-state")).toBe("checked")
  })
})
