import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// Member permissions. A failed load left the card blank under its heading,
// beside a toast that soon left, so an admin saw no permissions and nothing to
// do. It now says so, with Try again. Each permission is a settings row whose
// switch is named by the permission, the section says how it saves, and a
// refused change puts the switch back.

const api = vi.hoisted(() => ({ list: vi.fn(), set: vi.fn() }))
vi.mock("@/services/capabilityService", async (orig) => ({
  ...(await orig<typeof import("@/services/capabilityService")>()),
  listCapabilityPolicies: api.list,
  setCapabilityPolicy: api.set,
}))
vi.mock("@/lib/swrMutate", () => ({ appMutate: vi.fn() }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))

const { default: PermissionsCard } = await import("./PermissionsCard")

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  api.list.mockReset()
  api.set.mockReset()
})

describe("member permissions", () => {
  it("says the permissions couldn't load, and tries again", async () => {
    api.list.mockRejectedValueOnce(new Error("503")).mockResolvedValueOnce([{ capability: "workflow.manage", policy: "admins_only" }])
    render(<PermissionsCard />)
    expect(await screen.findByText("Couldn't load the member permissions")).toBeTruthy()
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Try again" })))
    expect(await screen.findAllByRole("switch")).toHaveLength(1)
  })

  it("names each switch by its permission, and says how changes save", async () => {
    api.list.mockResolvedValue([{ capability: "workflow.manage", policy: "all_members" }])
    render(<PermissionsCard />)
    const sw = (await screen.findAllByRole("switch"))[0]
    expect(sw.getAttribute("aria-checked")).toBe("true")
    // Named by the visible label, so clicking the words toggles it.
    expect(sw.id).toBeTruthy()
    expect(document.querySelector(`label[for="${sw.id}"]`)?.textContent).toBeTruthy()
    expect(screen.getByText(/Changes save as you make them\./)).toBeTruthy()
    expect(screen.getByText("All members can")).toBeTruthy()
  })

  it("puts a refused change back", async () => {
    api.list.mockResolvedValue([{ capability: "workflow.manage", policy: "admins_only" }])
    api.set.mockRejectedValue(new Error("refused"))
    render(<PermissionsCard />)
    const sw = (await screen.findAllByRole("switch"))[0]
    await act(async () => void fireEvent.click(sw))
    expect(sw.getAttribute("aria-checked")).toBe("false")
  })
})
