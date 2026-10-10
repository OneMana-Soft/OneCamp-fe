import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { resetHistoryForTest } from "@/lib/navigation/back"

let pathname = "/app/task/t1"
const router = { back: vi.fn(), replace: vi.fn(), push: vi.fn() }
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => router }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("@/components/navigationBar/orgAvatarNav", () => ({ OrgAvatarNav: () => <span /> }))

import { MobileTopNavigationBarFirst } from "./mobileTopNavigationBarFirst"

beforeEach(() => {
  resetHistoryForTest()
  router.back.mockReset()
  router.replace.mockReset()
  router.push.mockReset()
})
afterEach(() => cleanup())

describe("the phone's back arrow", () => {
  it("on a task opened from a link, goes to My Tasks rather than out of the app", () => {
    pathname = "/app/task/t1"
    render(<MobileTopNavigationBarFirst />)
    fireEvent.click(screen.getByRole("button", { name: "Back" }))
    expect(router.back).not.toHaveBeenCalled()
    expect(router.replace).toHaveBeenCalledWith("/app/myTask")
  })

  it("on a thread, goes to its channel without adding a history entry", () => {
    // It used to push the channel, so the system back gesture returned to the
    // thread that had just been left.
    pathname = "/app/channel/c1/p1"
    render(<MobileTopNavigationBarFirst />)
    fireEvent.click(screen.getByRole("button", { name: "Back" }))
    expect(router.push).not.toHaveBeenCalled()
    expect(router.replace).toHaveBeenCalledWith("/app/channel/c1")
  })

  it("is a 44px target, and so is the workspace menu on a tab's top level", () => {
    pathname = "/app/doc/d1"
    render(<MobileTopNavigationBarFirst />)
    expect(screen.getByRole("button", { name: "Back" }).className.split(/\s+/)).toEqual(expect.arrayContaining(["h-11", "w-11"]))
    cleanup()
    pathname = "/app/channel"
    render(<MobileTopNavigationBarFirst />)
    expect(screen.getByRole("button", { name: "Open organization profile" }).className.split(/\s+/)).toEqual(expect.arrayContaining(["h-11", "w-11"]))
  })
})
