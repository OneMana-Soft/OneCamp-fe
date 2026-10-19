import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"

vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn().mockResolvedValue([]), isSubmitting: false }) }))

import { PeoplePicker, pickedEmails, pickedKey, pickedMembers, type PickedPerson } from "./peoplePicker"

afterEach(cleanup)

function Picker({ allowEmail, start = [] }: { allowEmail?: boolean; start?: PickedPerson[] }) {
  const [people, setPeople] = useState<PickedPerson[]>(start)
  return <PeoplePicker value={people} onChange={setPeople} allowEmail={allowEmail} />
}

// Calendar A2: anyone can be invited to an event by their address.
describe("the people picker", () => {
  it("offers to invite an address typed, and adds it as a guest by email", () => {
    render(<Picker allowEmail />)
    const input = screen.getByRole("combobox")
    expect(input.getAttribute("placeholder")).toBe("Add people by name or email")
    fireEvent.change(input, { target: { value: " Alex@Example.com " } })
    expect(screen.getByRole("option", { name: "Invite alex@example.com by email" })).toBeTruthy()
    fireEvent.keyDown(input, { key: "Enter" })
    const chip = document.querySelector("[data-picked-email]") as HTMLElement
    expect(chip.textContent).toContain("alex@example.com")
    // Once is enough.
    fireEvent.change(input, { target: { value: "alex@example.com" } })
    expect(screen.queryByRole("option")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Remove alex@example.com" }))
    expect(document.querySelector("[data-picked-email]")).toBeNull()
  })

  it("offers nothing for an address where only members can be added, or for words that aren't one", () => {
    render(<Picker />)
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "alex@example.com" } })
    expect(screen.queryByRole("option")).toBeNull()
    cleanup()
    render(<Picker allowEmail />)
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "alex@" } })
    expect(screen.queryByRole("option")).toBeNull()
  })

  it("tells members from guests by email for whoever sends them", () => {
    const people: PickedPerson[] = [{ uuid: "m1", name: "Maya Chen" }, { uuid: "", name: "Alex Kim", email: "alex@example.com" }, { uuid: "", name: "lee@example.com", email: "lee@example.com" }]
    expect(pickedMembers(people)).toEqual(["m1"])
    expect(pickedEmails(people)).toEqual([{ email: "alex@example.com", name: "Alex Kim" }, { email: "lee@example.com" }])
    expect(people.map(pickedKey)).toEqual(["m1", "mailto:alex@example.com", "mailto:lee@example.com"])
  })
})
