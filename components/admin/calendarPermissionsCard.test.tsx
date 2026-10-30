import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactElement } from "react"
import type { PolicyInfo } from "@/services/workAccessService"

// Calendar A6 (owner decision O7): members see when others are busy unless
// an admin turns it off.

const freeBusy = (value: boolean): PolicyInfo => ({ key: "calendar.freebusy.members", kind: "bool", label: "", help: "", value, default: true, is_set: false })
let policies: PolicyInfo[] | undefined
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: policies ? { data: policies } : undefined, isError: false, mutate: vi.fn() }),
}))
const appMutate = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock("@/lib/swrMutate", () => ({ appMutate }))
const put = vi.hoisted(() => vi.fn())
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { put } }))
type Toasted = { title?: string; action?: ReactElement<{ onClick: () => Promise<void> }> }
const toast = vi.hoisted(() => vi.fn<(t: Toasted) => void>())
vi.mock("@/hooks/use-toast", async (orig) => ({ ...(await orig<object>()), useToast: () => ({ toast }), toast }))

const { default: CalendarPermissionsCard } = await import("./CalendarPermissionsCard")

afterEach(() => {
  cleanup()
  policies = undefined
  put.mockReset()
  appMutate.mockClear()
  toast.mockReset()
})

describe("the workspace's calendar permissions", () => {
  it("shows members' free and busy as on by default, and turns it off as it is switched", async () => {
    policies = [freeBusy(true)]
    put.mockResolvedValue({ data: { data: { ...freeBusy(false), is_set: true } } })
    render(<CalendarPermissionsCard />)
    const sw = screen.getByRole("switch", { name: /Members see when others are busy/ })
    expect(sw.getAttribute("aria-checked")).toBe("true")
    fireEvent.click(sw)
    await waitFor(() => expect(put).toHaveBeenCalledWith("/admin/policies/calendar.freebusy.members", { value: false }, { suppressErrorToast: true }))
    // The admins' list holds what the server answered.
    await waitFor(() => expect(appMutate).toHaveBeenCalled())
  })

  it("puts the switch back when the server refuses", async () => {
    policies = [freeBusy(true)]
    put.mockRejectedValue({ response: { status: 403, data: { msg: "Only admins change this." } } })
    render(<CalendarPermissionsCard />)
    fireEvent.click(screen.getByRole("switch", { name: /Members see when others are busy/ }))
    await waitFor(() => expect(put).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole("switch", { name: /Members see when others are busy/ }).getAttribute("aria-checked")).toBe("true"))
  })

  // design-14: a saved change is offered back on the toast, and Undo saves the old value.
  it("offers the change back, and Undo turns it on again", async () => {
    policies = [freeBusy(true)]
    put.mockResolvedValue({ data: { data: { ...freeBusy(false), is_set: true } } })
    render(<CalendarPermissionsCard />)
    fireEvent.click(screen.getByRole("switch", { name: /Members see when others are busy/ }))
    await waitFor(() => expect(toast.mock.calls.some(([t]) => t.action)).toBe(true))
    const offer = toast.mock.calls.map(([t]) => t).find((t) => t.action)!
    expect(offer.title).toBe("Members see when others are busy: Off")
    await act(async () => {
      await offer.action!.props.onClick()
    })
    expect(put).toHaveBeenLastCalledWith("/admin/policies/calendar.freebusy.members", { value: true }, { suppressErrorToast: true })
  })

  it("says it couldn't read the setting rather than guess it", () => {
    policies = []
    render(<CalendarPermissionsCard />)
    expect(screen.queryByRole("switch")).toBeNull()
    expect(screen.getByText(/the calendar permissions/)).toBeTruthy()
  })
})
