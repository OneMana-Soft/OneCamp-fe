import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { FormField } from "@/lib/forms/forms"
import { ItemCard } from "./FormItemCard"

// Tables B5b: a hidden question's card says only its link fills it, and hands over what to copy (CopyableCode):
// the whole prefill link once the form has one, the parameter while it's new.

afterEach(cleanup)

const budget: FormField[] = [{ id: "q4", label: "Budget", type: "number", required: false, hidden: true }]
const card = (link?: string) =>
  render(
    <ItemCard fields={budget} index={0} number={4} titleField="" hue="moss" open onToggle={() => {}} onChange={() => {}} onRemove={() => {}} onMove={() => {}} project={[]} link={link} />,
  )

describe("a hidden question's card", () => {
  it("copies the whole prefill link once the form has one", () => {
    card("https://camp.example/f/abc123")
    expect(screen.getByText("https://camp.example/f/abc123?prefill_q4=")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Copy prefill link" })).toBeTruthy()
  })

  it("copies the parameter while the form is new, and says a hidden question is never required", () => {
    card()
    expect(screen.getByText("?prefill_q4=")).toBeTruthy()
    expect(screen.getByText(/never required/)).toBeTruthy()
    expect(screen.getByRole("switch", { name: "Required" }).hasAttribute("disabled")).toBe(true)
  })
})

// Tables B5c (Airtable's hide_): a shown question's card hands over the link that fills it and hides it for a visit.
describe("a shown question's card", () => {
  const shown = (link?: string, f: Partial<FormField> = {}) =>
    render(
      <ItemCard fields={[{ ...budget[0], hidden: undefined, ...f }]} index={0} number={4} titleField="" hue="moss" open onToggle={() => {}} onChange={() => {}} onRemove={() => {}} onMove={() => {}} project={[]} link={link} />,
    )
  it("starts with a link unable to hide it, and says what the switch is for", () => {
    shown("https://camp.example/f/abc123")
    expect(screen.getByRole("switch", { name: "A link can fill and hide this" }).getAttribute("aria-checked")).toBe("false")
    expect(screen.getByText(/never for anything they must agree to/)).toBeTruthy()
    expect(screen.queryByText(/hide_q4/)).toBeNull()
  })
  it("copies the link that fills it and hides it, the answer at its end, once its managers turn that on", () => {
    shown("https://camp.example/f/abc123", { required: true, link_hides: true })
    expect(screen.getByText("https://camp.example/f/abc123?hide_q4=true&prefill_q4=")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Copy fill and hide link" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Copy prefill link" })).toBeNull()
  })
  it("offers it to no question a link can't answer, and not to a hidden one", () => {
    shown(undefined, { type: "file" })
    expect(screen.queryByText(/hide_q4/)).toBeNull()
    cleanup()
    card("https://camp.example/f/abc123")
    expect(screen.queryByText(/hide_q4/)).toBeNull()
  })
})
