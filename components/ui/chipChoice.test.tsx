import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import { CHIP_TONE } from "@/lib/ui/chipTone"

// One of a few as a row of the shared chip (design v3 §3.10): how a link
// reads, over the task picker. A choice, not a status, so no radio circle (in
// the picker, the to-do glyph under it read as a second set of radios).
const { ChipChoice } = await import("@/components/ui/chipChoice")

const WAYS = [
  { value: "relates", label: "relates to" },
  { value: "duplicates", label: "duplicates" },
  { value: "clones", label: "clones" },
] as const
type Way = (typeof WAYS)[number]["value"]

function Ways({ start = "relates", onChange = () => {} }: { start?: Way; onChange?: (v: Way) => void }) {
  const [way, setWay] = React.useState<Way>(start)
  const pick = (v: Way) => {
    setWay(v)
    onChange(v)
  }
  return <ChipChoice label="How it links" value={way} onValueChange={pick} options={WAYS} />
}

afterEach(cleanup)

const radio = (name: string) => screen.getByRole("radio", { name })
/** The chips in the tab order (tabIndex 0), by their words. */
const stops = () => screen.getAllByRole("radio").filter((r) => r.tabIndex === 0).map((r) => r.textContent)
/** A key on the focused chip, down then up; false when the chip marked it used. */
const press = (key: string, mods: Partial<Record<"shiftKey" | "ctrlKey" | "altKey" | "metaKey", boolean>> = {}) => {
  const at = document.activeElement as HTMLElement
  const kept = fireEvent.keyDown(at, { key, ...mods })
  fireEvent.keyUp(at, { key, ...mods })
  return kept
}

describe("a single choice as a row of chips", () => {
  it("is one radio group by its name, each choice a chip with no circle, the picked one in Chip's brand tint", () => {
    render(<Ways start="duplicates" />)
    const group = screen.getByRole("radiogroup", { name: "How it links" })
    const radios = screen.getAllByRole("radio")
    expect(radios.map((r) => r.textContent)).toEqual(["relates to", "duplicates", "clones"])
    for (const r of radios) {
      expect(group.contains(r)).toBe(true)
      // The shared chip, never a radio's circle.
      expect(r.className.split(/\s+/)).toContain("chip")
      expect(r.hasAttribute("data-chip")).toBe(true)
      expect(r.querySelector("svg")).toBeNull()
      // A finger's target at a phone's width; a mouse's chip from md.
      expect(r.className.split(/\s+/)).toEqual(expect.arrayContaining(["h-10", "md:h-[26px]"]))
      expect(r.hasAttribute("data-touch-target")).toBe(true)
    }
    const picked = screen.getByRole("radio", { name: "duplicates" })
    expect(picked.getAttribute("aria-checked")).toBe("true")
    expect(picked.className.split(/\s+/)).toEqual(expect.arrayContaining(CHIP_TONE.brand.split(" ")))
    const other = screen.getByRole("radio", { name: "clones" })
    expect(other.getAttribute("aria-checked")).toBe("false")
    expect(other.className).not.toContain("bg-brand-muted")
  })

  it("a click picks a chip; a click on the pick changes nothing", () => {
    const changed = vi.fn()
    render(<Ways start="duplicates" onChange={changed} />)
    fireEvent.click(radio("clones"))
    expect(radio("clones").getAttribute("aria-checked")).toBe("true")
    expect(changed).toHaveBeenLastCalledWith("clones")
    fireEvent.click(radio("clones"))
    expect(changed).toHaveBeenCalledTimes(1)
  })
})

// The keys of a radio group (WAI-ARIA), as a keyboard sends them: each key
// down then up, nothing waited for between. The focus and the pick move in the
// key's own handler, so a second key at speed starts from the first one's chip
// (Chromium runs input before a timer: a focus moved later left two quick
// ArrowRights one chip on, and the pick behind the focus).
describe("the keys of a row of chips: one tab stop, the arrows move the focus and the pick together", () => {
  it("has one chip in the tab order, the pick, and the row is no tab stop of its own", () => {
    render(<Ways start="duplicates" />)
    expect(stops()).toEqual(["duplicates"])
    expect(screen.getByRole("radiogroup", { name: "How it links" }).tabIndex).toBe(-1)
  })

  it("with nothing picked the first chip is the tab stop, and Enter or Space picks the chip with the focus, marked used", () => {
    const changed = vi.fn()
    render(<ChipChoice label="How it links" value={"" as Way} onValueChange={changed} options={WAYS} />)
    expect(stops()).toEqual(["relates to"])
    expect(screen.getAllByRole("radio").filter((r) => r.getAttribute("aria-checked") === "true")).toHaveLength(0)
    act(() => radio("relates to").focus())
    // Marked used: a list beneath (cmdk) would take an Enter as its lit row's pick.
    expect(press("Enter")).toBe(false)
    expect(changed).toHaveBeenLastCalledWith("relates")
    act(() => radio("clones").focus())
    expect(press(" ")).toBe(false)
    expect(changed).toHaveBeenLastCalledWith("clones")
  })

  it.each([
    ["ArrowRight", "clones", "clones"],
    ["ArrowDown", "clones", "clones"],
    ["ArrowLeft", "relates to", "relates"],
    ["ArrowUp", "relates to", "relates"],
    ["Home", "relates to", "relates"],
    ["End", "clones", "clones"],
  ] as const)("%s from the middle chip moves the focus and the pick to %s at once, the key marked used", (key, name, value) => {
    const changed = vi.fn()
    render(<Ways start="duplicates" onChange={changed} />)
    act(() => radio("duplicates").focus())
    expect(press(key)).toBe(false)
    expect(document.activeElement).toBe(radio(name))
    expect(radio(name).getAttribute("aria-checked")).toBe("true")
    expect(radio("duplicates").getAttribute("aria-checked")).toBe("false")
    expect(changed).toHaveBeenLastCalledWith(value)
    expect(stops()).toEqual([name])
  })

  it.each([
    ["ArrowRight", "clones", "relates to", "relates"],
    ["ArrowDown", "clones", "relates to", "relates"],
    ["ArrowLeft", "relates", "clones", "clones"],
    ["ArrowUp", "relates", "clones", "clones"],
  ] as const)("%s goes round the end of the row, from %s to %s", (key, start, name, value) => {
    const changed = vi.fn()
    render(<Ways start={start} onChange={changed} />)
    act(() => (document.querySelector('[role="radio"][aria-checked="true"]') as HTMLElement).focus())
    press(key)
    expect(document.activeElement).toBe(radio(name))
    expect(radio(name).getAttribute("aria-checked")).toBe("true")
    expect(changed).toHaveBeenLastCalledWith(value)
    expect(stops()).toEqual([name])
  })

  it("two ArrowRights back to back move two chips, the pick with the focus", () => {
    const changed = vi.fn()
    render(<Ways start="relates" onChange={changed} />)
    act(() => radio("relates to").focus())
    press("ArrowRight")
    press("ArrowRight")
    expect(document.activeElement).toBe(radio("clones"))
    expect(radio("clones").getAttribute("aria-checked")).toBe("true")
    expect(changed.mock.calls).toEqual([["duplicates"], ["clones"]])
  })

  it("leaves an arrow with Shift, Ctrl, Alt or the command key to others", () => {
    const changed = vi.fn()
    render(<Ways start="duplicates" onChange={changed} />)
    act(() => radio("duplicates").focus())
    for (const mod of ["shiftKey", "ctrlKey", "altKey", "metaKey"] as const) {
      expect(press("ArrowRight", { [mod]: true })).toBe(true)
      expect(document.activeElement).toBe(radio("duplicates"))
    }
    expect(changed).not.toHaveBeenCalled()
  })
})
