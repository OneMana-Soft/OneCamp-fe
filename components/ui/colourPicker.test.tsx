import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import ColourPicker from "@/components/ui/colourPicker"
import { ownColour } from "@/lib/color/ownColour"

// More colours (calendar head B, DESIGN-BUILD-112), a shared picker: a hue and lightness pad the arrow keys move,
// a labelled hex field, "Your colours", and a live preview in both themes. An invalid hex says so and Save waits;
// a colour that must move to read shows where it moved to.
afterEach(cleanup)

const open = (props: Partial<React.ComponentProps<typeof ColourPicker>> = {}) => {
  const onSave = vi.fn()
  const onCancel = vi.fn()
  render(<ColourPicker value="#3b7ddd" recent={["#10b981", "#e0a030"]} sample="Launch review" onSave={onSave} onCancel={onCancel} {...props} />)
  return { onSave, onCancel, hex: screen.getByRole("textbox", { name: "Hex" }) as HTMLInputElement }
}

describe("More colours", () => {
  it("opens on the colour given, saves what the hex field says, and cancels", () => {
    const { onSave, onCancel, hex } = open()
    expect(hex.value).toBe("#3b7ddd")
    fireEvent.change(hex, { target: { value: "#E0A030" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(onSave).toHaveBeenCalledWith("#e0a030")
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onCancel).toHaveBeenCalled()
  })

  it("says an invalid hex is one and keeps Save off until it is a colour", () => {
    const { hex } = open()
    fireEvent.change(hex, { target: { value: "#3b7d" } })
    expect(hex.getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByRole("alert").textContent).toBe("Write it as # and six digits or letters a to f, like #3b7ddd.")
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(hex, { target: { value: "10b981" } })
    expect(screen.queryByRole("alert")).toBeNull()
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("leaves Enter to an input method while it is choosing a word, and saves on Enter after", () => {
    const { onSave, hex } = open()
    fireEvent.change(hex, { target: { value: "#e0a030" } })
    fireEvent.keyDown(hex, { key: "Enter", isComposing: true })
    fireEvent.keyDown(hex, { key: "Enter", keyCode: 229 })
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.keyDown(hex, { key: "Enter" })
    expect(onSave).toHaveBeenCalledWith("#e0a030")
  })

  it("moves through the pad by the arrow keys, and the hex field follows", () => {
    const { hex } = open()
    const pad = screen.getByRole("slider", { name: "Colour" })
    expect(pad.getAttribute("aria-valuetext")).toMatch(/^Hue \d+°, lightness \d+%$/)
    const before = hex.value
    fireEvent.keyDown(pad, { key: "ArrowRight" })
    expect(hex.value).not.toBe(before)
    fireEvent.keyDown(pad, { key: "ArrowDown", shiftKey: true })
    expect(pad.getAttribute("aria-valuetext")).toMatch(/lightness \d+%/)
  })

  it("picks one of your colours, and says when you have none yet", () => {
    const { hex } = open()
    const yours = screen.getByRole("group", { name: "Your colours" })
    fireEvent.click(within(yours).getByRole("button", { name: "#10b981" }))
    expect(hex.value).toBe("#10b981")
    cleanup()
    open({ recent: [] })
    expect(screen.getByText("Colours you save show here.")).toBeTruthy()
  })

  it("previews the colour on a light and a dark sheet, and shows a clamped one where it moved to", () => {
    const { hex } = open()
    const light = document.querySelector("[data-preview='light']") as HTMLElement
    const dark = document.querySelector("[data-preview='dark']") as HTMLElement
    expect(light.textContent).toContain("Launch review")
    expect(dark.textContent).toContain("Launch review")
    expect(document.querySelector("[data-clamped]")).toBeNull()
    fireEvent.change(hex, { target: { value: "#fafafa" } })
    const note = document.querySelector("[data-clamped]") as HTMLElement
    expect(note.textContent).toMatch(/light screen/i)
    expect(note.querySelector(`[data-swatch='${ownColour("#fafafa")!.light.solid}']`)).toBeTruthy()
    fireEvent.change(hex, { target: { value: "#0a0a0a" } })
    expect((document.querySelector("[data-clamped]") as HTMLElement).textContent).toMatch(/dark screen/i)
  })
})
