import * as React from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, configure, fireEvent, render, screen, within } from "@testing-library/react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { identityHue } from "@/lib/identityHue"

vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))

import { ActiveUsersBar } from "./ActiveUsersBar"
import { createDocCommandBus, DocBusContext } from "./registry/commandBus"
import { setPresence } from "./presence/store"
import { setPresenceControl } from "./presence/control"

// "Here now" loads on first open: here before the tests, and waited for
// longer than a second, which a full parallel run on a loaded machine took.
configure({ asyncUtilTimeout: 5000 })
beforeAll(async () => {
  await import("./presence/PresenceList")
})

afterEach(() => {
  cleanup()
  setPresence("d1", null)
})

const users = [
  { id: "289b6b5d-c30c-427a-bcec-634cb294f285", name: "Sam Rivera", color: "#123456" },
  { id: "b5c0a8f1-0000-4000-8000-000000000002", name: "Maya Chen", color: "#654321" },
]

// Someone's face here is the one they have everywhere: their identity hue
// (identityHue, keyed by display name as every avatar is), not the random colour their
// own browser announced.
describe("the faces of who is here", () => {
  it("draws each person in their identity hue, named for a screen reader", () => {
    render(
      <TooltipProvider>
        <ActiveUsersBar users={users} />
      </TooltipProvider>,
    )
    for (const u of users) {
      const face = screen.getByRole("img", { name: u.name })
      expect(face.querySelector("[data-hue]")?.getAttribute("data-hue")).toBe(identityHue({ name: u.name }))
      expect(face.innerHTML).not.toMatch(/background-color/)
    }
    expect(screen.getByText("SR")).toBeTruthy()
  })

  it("counts the rest, and names them", () => {
    render(
      <TooltipProvider>
        <ActiveUsersBar users={[...users, { id: "c", name: "Jonas Weber", color: "" }]} maxShown={2} />
      </TooltipProvider>,
    )
    expect(screen.getByRole("img", { name: "1 more: Jonas Weber" }).textContent).toBe("+1")
  })
})

// B8: how each person is here, and Jump to and Follow by awareness client.
// Two people called "Sam Rivera" are two people (N50).
describe("who is here, live", () => {
  const sam1 = { id: "u-sam-1", name: "Sam Rivera", color: "" }
  const sam2 = { id: "u-sam-2", name: "Sam Rivera", color: "" }
  const me = { id: "u-me", name: "Priya Shah", color: "" }
  const bus = createDocCommandBus("d1")
  const shell = (ui: React.ReactNode) =>
    render(
      <TooltipProvider>
        <DocBusContext.Provider value={bus}>{ui}</DocBusContext.Provider>
      </TooltipProvider>,
    )

  function live(following: number | null = null) {
    setPresence("d1", {
      people: {
        "u-sam-1": { clients: [11], name: "Sam Rivera", mode: "editing", idle: false },
        "u-sam-2": { clients: [22, 23], name: "Sam Rivera", mode: "viewing", idle: true },
        "u-me": { clients: [33], name: "Priya Shah", mode: "editing", idle: false },
      },
      edit: null,
      self: "u-me",
    })
    const control = { jump: vi.fn(() => true), follow: vi.fn(), following }
    setPresenceControl(bus.key, control)
    return control
  }

  afterEach(() => setPresenceControl(bus.key, null))

  it("says in each face's name whether they are editing, viewing or idle, and dots the idle one amber", () => {
    live()
    shell(<ActiveUsersBar users={[sam1, sam2, me]} />)
    expect(screen.getByRole("img", { name: "Sam Rivera, editing" })).toBeTruthy()
    const idle = screen.getByRole("img", { name: "Sam Rivera, idle" })
    expect(idle.querySelector("[data-presence-status]")?.getAttribute("data-presence-status")).toBe("idle")
  })

  it("jumps to the Sam whose row it is, by their client, and names who each button is for", async () => {
    const control = live()
    shell(<ActiveUsersBar users={[sam1, sam2, me]} />)
    fireEvent.click(screen.getByRole("button", { name: /^Here now/ }))
    const jumps = await screen.findAllByRole("button", { name: "Jump to Sam Rivera" })
    expect(jumps).toHaveLength(2)
    fireEvent.click(jumps[1])
    // Sam's second tab (22) is the one used last: the list asks for it, never for a name.
    expect(control.jump).toHaveBeenCalledWith(22)
  })

  it("follows someone and stops, and lists you last, with nothing to jump to", async () => {
    let control = live()
    shell(<ActiveUsersBar users={[me, sam1, sam2]} />)
    fireEvent.click(screen.getByRole("button", { name: /^Here now/ }))
    const rows = await screen.findAllByRole("listitem")
    expect(within(rows[rows.length - 1]).getByText("You")).toBeTruthy()
    expect(within(rows[rows.length - 1]).queryByRole("button")).toBeNull()
    fireEvent.click(within(rows[0]).getByRole("button", { name: "Follow Sam Rivera" }))
    expect(control.follow).toHaveBeenCalledWith(11)
    act(() => {
      control = live(11)
    })
    fireEvent.click(screen.getByRole("button", { name: /^Here now/ }))
    const stop = await screen.findByRole("button", { name: "Stop following Sam Rivera" })
    expect(stop.getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(stop)
    expect(control.follow).toHaveBeenCalledWith(null)
  })

  it("says Idle, Viewing and Editing in words beside each name", async () => {
    live()
    shell(<ActiveUsersBar users={[sam1, sam2, me]} />)
    fireEvent.click(screen.getByRole("button", { name: /^Here now/ }))
    await screen.findAllByRole("button", { name: "Jump to Sam Rivera" })
    expect(Array.from(document.querySelectorAll("[data-presence-state]")).map((el) => el.textContent)).toEqual(["Editing", "Idle", "Editing"])
  })

  it("offers no jump where nothing can jump (a board, or before the doc's editor is live)", async () => {
    shell(<ActiveUsersBar users={[sam1, me]} />)
    fireEvent.click(screen.getByRole("button", { name: /^Here now/ }))
    await screen.findAllByRole("listitem")
    expect(screen.queryByRole("button", { name: /Jump to/ })).toBeNull()
  })
})
