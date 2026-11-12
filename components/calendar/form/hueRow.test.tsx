import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// The Event Form's colour (calendar head B, DESIGN-BUILD-112): the curated hues first, then the event's own colour
// when it has one, then a ring with "+", More colours, which opens the picker and keeps the colour in Your colours.
const setPreference = vi.hoisted(() => vi.fn())
const prefs = vi.hoisted(() => ({ now: { "calendar.recent_colours": ["#e0a030"] } as Record<string, unknown> }))
vi.mock("@/lib/preferences/usePreference", () => ({ KEY: "/user/preferences", setPreference }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: { data: prefs.now }, isError: false, mutate: vi.fn() }) }))

import { HueRow } from "@/components/calendar/form/hueRow"

afterEach(() => {
  cleanup()
  setPreference.mockReset()
})

describe("the form's colour row", () => {
  it("ends with More colours, a ring with a plus, after the curated hues", () => {
    render(<HueRow value="moss" onChange={vi.fn()} />)
    const radios = screen.getAllByRole("radio")
    expect(radios).toHaveLength(7)
    const more = screen.getByRole("button", { name: "More colours" })
    expect(more.getAttribute("data-more-colours")).toBe("")
    expect(more.compareDocumentPosition(radios[radios.length - 1]) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
  })

  it("shows an event's own colour as a chosen swatch of its own", () => {
    render(<HueRow value="#10b981" onChange={vi.fn()} />)
    const own = screen.getByRole("radio", { name: "Your colour #10b981" })
    expect(own.getAttribute("aria-checked")).toBe("true")
    expect(own.getAttribute("data-own-hue")).toBe("#10b981")
  })

  it("opens the picker on More colours, sets the colour on Save and keeps it first in Your colours", async () => {
    const onChange = vi.fn()
    setPreference.mockResolvedValue(undefined)
    render(<HueRow value="" onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: "More colours" }))
    const hex = (await screen.findByRole("textbox", { name: "Hex" }, { timeout: 5000 })) as HTMLInputElement
    fireEvent.change(hex, { target: { value: "#7A1F5C" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(onChange).toHaveBeenCalledWith("#7a1f5c")
    await waitFor(() => expect(setPreference).toHaveBeenCalledWith("calendar.recent_colours", ["#7a1f5c", "#e0a030"], ["#e0a030"]))
  })
})
