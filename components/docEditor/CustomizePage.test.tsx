import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

const hoisted = vi.hoisted(() => ({ doc: {} as Record<string, unknown>, set: vi.fn() }))

vi.mock("./chrome/useDoc", () => ({ useDoc: () => hoisted.doc }))
vi.mock("@/services/docChromeService", () => ({ setDocLook: hoisted.set }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isTablet: false, isDesktop: true }) }))

import CustomizePage from "./CustomizePage"
import { DocBusContext, createDocCommandBus, holdBus } from "./registry/commandBus"

beforeEach(() => {
  hoisted.doc = { doc_edit_access: 1, doc_font: "", doc_small_text: false, doc_full_width: false }
  hoisted.set.mockReset().mockResolvedValue(undefined)
  localStorage.clear()
})
afterEach(cleanup)

describe("Customise page (P18)", () => {
  it("sets the page's font, small text and full width for everyone, for whoever may edit", async () => {
    const bus = createDocCommandBus("cp1")
    const release = holdBus(bus)
    const toggles: string[] = []
    bus.on("toggle", ({ what }) => toggles.push(what))
    render(
      <DocBusContext.Provider value={bus}>
        <CustomizePage docId="cp1" onClose={() => {}} />
      </DocBusContext.Provider>,
    )
    await act(async () => fireEvent.click(document.querySelector('[data-font="serif"]')!))
    expect(hoisted.set).toHaveBeenCalledWith({ doc_uuid: "cp1", font: "serif" })
    await act(async () => fireEvent.click(screen.getByRole("switch", { name: "Small text" })))
    expect(hoisted.set).toHaveBeenLastCalledWith({ doc_uuid: "cp1", small_text: true })
    await act(async () => fireEvent.click(screen.getByRole("switch", { name: "Full width" })))
    expect(hoisted.set).toHaveBeenLastCalledWith({ doc_uuid: "cp1", full_width: true })
    // This person's own view follows at once.
    expect(toggles).toEqual(["fullWidth"])
    release()
  })

  it("holds the style while a soft lock holds the page", () => {
    hoisted.doc = { doc_edit_access: 1, doc_lock_level: "soft" }
    render(<CustomizePage docId="cp3" onClose={() => {}} />)
    expect(screen.getByText("The page is locked. Unlock it to change its style.")).toBeTruthy()
    expect((screen.getByRole("switch", { name: "Small text" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("shows a reader the style, unchangeable, and still lets them hide Linked from for themselves", () => {
    hoisted.doc = { doc_edit_access: 0, doc_font: "mono" }
    render(<CustomizePage docId="cp2" onClose={() => {}} />)
    expect(screen.getByText("Only people who can edit change the page's style.")).toBeTruthy()
    expect((screen.getByRole("switch", { name: "Small text" }) as HTMLButtonElement).disabled).toBe(true)
    expect(document.querySelector('[data-font="mono"]')?.getAttribute("data-state")).toBe("checked")
    fireEvent.click(screen.getByRole("switch", { name: "Show what links here" }))
    expect(localStorage.getItem("onecamp-doc-backlinks-hidden:cp2")).toBe("1")
    expect(hoisted.set).not.toHaveBeenCalled()
  })
})
