import * as React from "react"
import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"

import { focusCarry } from "./focusCarry"

afterEach(cleanup)

type Carry = ReturnType<typeof focusCarry>
/** Row height and More as stand-ins, then as real nodes in another tree (as Radix's triggers wrap them), or gone. */
function Toolbar({ carry, shown }: { carry: Carry; shown: "stand-ins" | "real" | "none" }) {
  const buttons = ["Row height", "More"].map((name) => <button key={name} ref={carry} aria-label={name} />)
  return (
    <div>
      <input aria-label="Elsewhere" />
      {shown === "stand-ins" ? buttons : shown === "real" ? buttons.map((b) => <span key={b.key}>{b}</span>) : null}
    </div>
  )
}

describe("focusCarry", () => {
  it("gives the focus a stand-in held to the node that takes its place", () => {
    const carry = focusCarry()
    const { rerender } = render(<Toolbar carry={carry} shown="stand-ins" />)
    const standIn = screen.getByRole("button", { name: "Row height" })
    standIn.focus()
    rerender(<Toolbar carry={carry} shown="real" />)
    const real = screen.getByRole("button", { name: "Row height" })
    expect(real).not.toBe(standIn)
    expect(document.activeElement).toBe(real)
  })

  it("gives the focus to the node with the same name only", () => {
    const carry = focusCarry()
    const { rerender } = render(<Toolbar carry={carry} shown="stand-ins" />)
    screen.getByRole("button", { name: "More" }).focus()
    rerender(<Toolbar carry={carry} shown="real" />)
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "More" }))
  })

  it("gives no focus when no stand-in had it", () => {
    const carry = focusCarry()
    const { rerender } = render(<Toolbar carry={carry} shown="stand-ins" />)
    const elsewhere = screen.getByRole("textbox", { name: "Elsewhere" })
    elsewhere.focus()
    rerender(<Toolbar carry={carry} shown="real" />)
    expect(document.activeElement).toBe(elsewhere)
  })

  it("leaves the focus where it went after the stand-in went", () => {
    const carry = focusCarry()
    const { rerender } = render(<Toolbar carry={carry} shown="stand-ins" />)
    screen.getByRole("button", { name: "Row height" }).focus()
    rerender(<Toolbar carry={carry} shown="none" />)
    const elsewhere = screen.getByRole("textbox", { name: "Elsewhere" })
    elsewhere.focus()
    rerender(<Toolbar carry={carry} shown="real" />)
    expect(document.activeElement).toBe(elsewhere)
  })

  it("gives nothing to a node drawn in a later commit, though the focus stayed on <body> after the stand-in went", async () => {
    const carry = focusCarry()
    const { rerender } = render(<Toolbar carry={carry} shown="stand-ins" />)
    screen.getByRole("button", { name: "Row height" }).focus()
    rerender(<Toolbar carry={carry} shown="none" />)
    expect(document.activeElement).toBe(document.body)
    // As Row height leaving with the grid for the board, and coming back with it later: no node swapped for another.
    await act(async () => {})
    rerender(<Toolbar carry={carry} shown="real" />)
    expect(document.activeElement).toBe(document.body)
  })
})
