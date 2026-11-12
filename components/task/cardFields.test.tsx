import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { CardFields, CardFieldsContext } from "./cardFields"
import type { TaskField } from "@/lib/tasks/fields"

const channel = {
  id: "f-channel",
  name: "Channel",
  type: "select",
  on_card: true,
  options: [{ id: "o-email", label: "Email", color: "#3b82f6" }],
} as unknown as TaskField
const markets = {
  id: "f-markets",
  name: "Markets",
  type: "multi_select",
  on_card: true,
  options: [
    { id: "uk", label: "UK", color: "#22c55e" },
    { id: "de", label: "Germany", color: "#f59e0b" },
    { id: "in", label: "India", color: "#ef4444" },
  ],
} as unknown as TaskField

function card(values: Record<string, unknown>) {
  return render(
    <CardFieldsContext.Provider value={{ fields: [channel, markets] }}>
      <CardFields values={values as never} />
    </CardFieldsContext.Provider>,
  )
}

afterEach(cleanup)

// PTC-31: a card wrote its Channel as bare text ("Email") under the title,
// where the list draws a choice as a neutral chip with its colour's dot.
describe("a card's choices", () => {
  it("draws a choice as a chip with its colour's dot, named for the reader", () => {
    const { container } = card({ "f-channel": "o-email" })
    const chip = screen.getByText("Email")
    expect(chip.closest("[data-card-field='f-channel']")).toBeTruthy()
    expect(container.querySelector("[data-card-field='f-channel'] [data-chip-dot]")).toBeTruthy()
    expect(screen.getByText("Channel:")).toBeTruthy()
  })

  it("draws two of many choices, then how many more", () => {
    const { container } = card({ "f-markets": ["uk", "de", "in"] })
    expect(container.querySelectorAll("[data-card-field='f-markets'] [data-chip-dot]")).toHaveLength(2)
    expect(screen.getByText("+1")).toBeTruthy()
  })

  // V-698W: the server sends no value of a field it hides from the reader (a
  // money field, to anyone not an admin of its project); a card draws none,
  // even one the device kept from before.
  it("draws no field the server hides from its reader, even with a value kept from before (V-698W)", () => {
    render(
      <CardFieldsContext.Provider value={{ fields: [{ ...channel, hidden: true } as TaskField, markets] }}>
        <CardFields values={{ "f-channel": "o-email", "f-markets": ["uk"] } as never} />
      </CardFieldsContext.Provider>,
    )
    expect(screen.queryByText("Email")).toBeNull()
    expect(screen.queryByText("Channel:")).toBeNull()
    expect(screen.getByText("UK")).toBeTruthy()
  })
})
