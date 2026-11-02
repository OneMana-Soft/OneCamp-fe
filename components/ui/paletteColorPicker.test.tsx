import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { ColorPicker } from "@/components/ui/paletteColorPicker"
import { STORED_NAME } from "@/lib/taskStatus"

afterEach(cleanup)

// The picker sits in rows of 44 px controls (a status's name and its tools, a field option's): under a finger its
// swatch button takes a tap across 44 px like every base control (app/phone.css F3), and its name says what it
// colours, so a list of them reads apart.
describe("the colour picker", () => {
  it("takes a finger's tap across 44 px like the base controls, and names what it colours and the colour", () => {
    render(<ColorPicker value={STORED_NAME.sky} label="Beta" onChange={() => {}} />)
    const swatch = screen.getByRole("button", { name: "Colour of Beta: Sky" })
    expect(swatch.hasAttribute("data-touch-target")).toBe(true)
  })

  it("writes the name the server stores for the hue picked", () => {
    const picked = vi.fn()
    render(<ColorPicker value={STORED_NAME.sky} label="Beta" onChange={picked} />)
    fireEvent.click(screen.getByRole("button", { name: "Colour of Beta: Sky" }))
    fireEvent.click(screen.getByRole("option", { name: "Moss" }))
    expect(picked).toHaveBeenCalledWith(STORED_NAME.moss)
  })
})
