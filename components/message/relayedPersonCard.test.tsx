import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { RelayedPersonCard } from "./relayedPersonCard"
import { splitRelayedName } from "@/lib/relayedAuthor"

// F-42: a guest's name in a message did nothing when pressed; a member's
// opens their profile card.
describe("a guest's or Slack person's name", () => {
  afterEach(cleanup)

  it("opens a read-only card: who they are, where from, and how they write here", () => {
    render(<RelayedPersonCard name="Priya (Acme)" kind="guest" />)
    fireEvent.click(screen.getByRole("button", { name: "Priya (Acme)" }))
    const card = document.querySelector<HTMLElement>("[data-relayed-card]")!
    expect(card.textContent).toContain("Priya")
    expect(card.textContent).toContain("From Acme. Writes here through a guest link, and isn't a member of this workspace.")
    expect(card.querySelector('[data-principal-tag="guest"]')).toBeTruthy()
    expect(card.querySelector("button, a")).toBeNull()
  })

  it("says a Slack person writes through the bridge", () => {
    render(<RelayedPersonCard name="Ana Ruiz" kind="bridge" />)
    fireEvent.click(screen.getByRole("button", { name: "Ana Ruiz" }))
    expect(document.querySelector("[data-relayed-card]")!.textContent).toContain("Writes in Slack. Their messages reach this channel through the Slack bridge.")
  })

  it("reads the organisation out of the name", () => {
    expect(splitRelayedName("Priya (Acme)")).toEqual({ person: "Priya", org: "Acme" })
    expect(splitRelayedName("Ana Ruiz")).toEqual({ person: "Ana Ruiz" })
    expect(splitRelayedName("Guest")).toEqual({ person: "Guest" })
  })
})
