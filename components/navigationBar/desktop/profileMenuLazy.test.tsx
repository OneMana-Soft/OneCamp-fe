import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import * as Menu from "@radix-ui/react-dropdown-menu"

// fluid-15: a cold load ran the profile menu's body (its hooks and items) once
// per trigger, for a menu nobody had opened. The body is a chunk of its own,
// fetched when a trigger is pointed at or focused and drawn from the first
// open on; until its code is in, the menu opens at once on its own room.
const body = vi.hoisted(() => ({ renders: 0, loads: 0 }))
vi.mock("@/components/navigationBar/desktop/ProfileMenuBody", () => {
  body.loads++
  return {
    ProfileMenuBody: () => {
      body.renders++
      return (
        <Menu.Portal>
          <Menu.Content aria-label="Profile and settings">
            <Menu.Item>Sign out</Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      )
    },
  }
})

const warmSections = vi.hoisted(() => vi.fn(async () => true))
vi.mock("@/components/profile/profileSections", () => ({ warmProfileSections: warmSections }))

const { ProfileMenu } = await import("@/components/navigationBar/desktop/SidebarFoot")
const { QUIET_MS, SETTLE_MS } = await import("@/lib/ui/whenQuiet")

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("the profile menu", () => {
  it("runs none of its body until it is opened, and fetches it when its trigger is pointed at", async () => {
    render(
      <ProfileMenu>
        <button type="button">Profile and settings</button>
      </ProfileMenu>,
    )
    expect(body.renders).toBe(0)
    const trigger = screen.getByRole("button", { name: "Profile and settings" })
    await act(async () => void fireEvent.pointerEnter(trigger))
    expect(body.loads).toBe(1)
    expect(body.renders).toBe(0)
    await act(async () => void fireEvent.keyDown(trigger, { key: "Enter" }))
    expect(await screen.findByRole("menuitem", { name: "Sign out" })).toBeTruthy()
    expect(body.renders).toBeGreaterThan(0)
  })

  // fluid-14: Settings opens from here, and its code came at the press.
  it("warms its body and Your profile's sections once the first screen has settled", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] })
    vi.stubGlobal("requestIdleCallback", (cb: () => void) => setTimeout(cb, 0) as unknown as number)
    vi.stubGlobal("cancelIdleCallback", (id: number) => clearTimeout(id))
    const loadsBefore = body.loads
    render(
      <ProfileMenu>
        <button type="button">Profile and settings</button>
      </ProfileMenu>,
    )
    await act(() => vi.advanceTimersByTimeAsync(SETTLE_MS - 100))
    expect(warmSections).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(QUIET_MS + 500))
    expect(warmSections).toHaveBeenCalled()
    expect(body.loads).toBeGreaterThanOrEqual(loadsBefore)
  })
})

