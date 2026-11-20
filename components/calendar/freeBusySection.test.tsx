import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// gcal-14 (W4): each person's own choice whether others see when they're busy (Policy Registry,
// person scope), which a workspace that shows nobody's busy times overrules.
const read = vi.hoisted(() => ({ data: undefined as unknown, isError: false, mutate: vi.fn() }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: (url: string) => (url === "/calendar/freebusy" ? read : { data: undefined }) }))
const put = vi.hoisted(() => vi.fn())
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { put, get: vi.fn() } }))
const net = vi.hoisted(() => ({ offline: false }))
vi.mock("@/lib/connectivity", async (orig) => ({ ...(await orig<object>()), isAppOffline: () => net.offline }))
type Toasted = { title?: string; action?: { props: { onClick: () => Promise<void> } } }
const toast = vi.hoisted(() => vi.fn<(t: Toasted) => void>())
vi.mock("@/hooks/use-toast", async (orig) => ({ ...(await orig<object>()), useToast: () => ({ toast }), toast }))

import { FreeBusySection } from "./freeBusySection"

afterEach(() => {
  cleanup()
  put.mockReset()
  toast.mockReset()
  read.mutate.mockReset()
  net.offline = false
})

const showing = (hidden: boolean, workspace = true) => {
  read.data = { data: { hidden, workspace } }
  render(<FreeBusySection />)
  return screen.getByRole("switch", { name: "Show when you're busy" })
}

describe("whether others see when you're busy", () => {
  it("is on when you show it, and keeps it to yourself when switched off", async () => {
    const sw = showing(false)
    expect(sw.getAttribute("aria-checked")).toBe("true")
    put.mockResolvedValueOnce({ data: { data: { hidden: true, workspace: true } } })
    fireEvent.click(sw)
    await waitFor(() => expect(put).toHaveBeenCalledWith("/calendar/freebusy", { hidden: true }, expect.anything()))
    await waitFor(() => expect(read.mutate).toHaveBeenCalledWith({ data: { hidden: true, workspace: true } }, { revalidate: false }))
    expect(sw.getAttribute("aria-checked")).toBe("false")
    // Its offer back lands here, not in the next test.
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Show when you're busy: Off" })))
  })

  // The other profile switches offer a saved change back; this one does too, through the same PUT.
  it("offers the change back, and Undo shows your busy times again", async () => {
    const sw = showing(false)
    put.mockResolvedValueOnce({ data: { data: { hidden: true, workspace: true } } })
    fireEvent.click(sw)
    await waitFor(() => expect(toast.mock.calls.some(([t]) => t.action)).toBe(true))
    const offer = toast.mock.calls.map(([t]) => t).find((t) => t.action)!
    expect(offer.title).toBe("Show when you're busy: Off")
    expect(sw.getAttribute("aria-checked")).toBe("false")
    put.mockResolvedValueOnce({ data: { data: { hidden: false, workspace: true } } })
    await act(async () => {
      await offer.action!.props.onClick()
    })
    expect(put).toHaveBeenLastCalledWith("/calendar/freebusy", { hidden: false }, expect.anything())
    expect(read.mutate).toHaveBeenLastCalledWith({ data: { hidden: false, workspace: true } }, { revalidate: false })
    expect(sw.getAttribute("aria-checked")).toBe("true")
  })

  it("says so when Undo is refused, and keeps the switch where the change put it", async () => {
    const sw = showing(false)
    // The read's cache takes the saved answer, as SWR's would.
    read.mutate.mockImplementation((d?: unknown) => {
      if (d) read.data = d
    })
    put.mockResolvedValueOnce({ data: { data: { hidden: true, workspace: true } } })
    fireEvent.click(sw)
    await waitFor(() => expect(toast.mock.calls.some(([t]) => t.action)).toBe(true))
    const offer = toast.mock.calls.map(([t]) => t).find((t) => t.action)!
    put.mockRejectedValueOnce({ response: { status: 500, data: {} } })
    await act(async () => {
      await offer.action!.props.onClick()
    })
    expect(put).toHaveBeenLastCalledWith("/calendar/freebusy", { hidden: false }, expect.anything())
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Couldn't undo that" }))
    expect(sw.getAttribute("aria-checked")).toBe("false")
  })

  it("is off when you keep it to yourself", () => {
    expect(showing(true).getAttribute("aria-checked")).toBe("false")
  })

  it("goes back and says why when the save fails", async () => {
    const sw = showing(false)
    put.mockRejectedValueOnce({ response: { status: 500, data: {} } })
    fireEvent.click(sw)
    await waitFor(() => expect(document.body.textContent).toMatch(/Not saved\./))
    expect(sw.getAttribute("aria-checked")).toBe("true")
  })

  it("is off and can't be changed when the workspace shows nobody's busy times", () => {
    const sw = showing(false, false)
    expect(sw.getAttribute("aria-checked")).toBe("false")
    expect(sw.hasAttribute("disabled")).toBe(true)
    expect(screen.getByText("Your workspace keeps everyone's busy times private.")).toBeTruthy()
  })

  it("saves nothing offline, and says it can't save now", async () => {
    net.offline = true
    const sw = showing(false)
    fireEvent.click(sw)
    await waitFor(() => expect(document.body.textContent).toContain("You're offline"))
    expect(put).not.toHaveBeenCalled()
    expect(sw.getAttribute("aria-checked")).toBe("true")
    expect(document.body.textContent).toContain("Not saved. You're offline. This can't be saved now.")
  })
})
