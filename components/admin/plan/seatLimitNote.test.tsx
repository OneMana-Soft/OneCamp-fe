import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { SeatLimitNote } from "./SeatLimitNote"
import { seatNoteDue } from "@/lib/people/seatWords"

afterEach(cleanup)

const LINKS = {
  licence: "https://shop.example/buy?plan=lifetime",
  cloud: "https://shop.example/buy?plan=cloud",
  account: "https://shop.example/account",
  pricing: "https://shop.example/pricing",
}

// One note wherever the free plan's limit is met (ADMIN-02): the invite
// dialogs, the import, a placeholder's profile and Members. It used to be
// three different lines, one of them red, and none led anywhere.
describe("SeatLimitNote", () => {
  it("is quiet under 80%, and on a workspace with no limit", () => {
    const { container, rerender } = render(<SeatLimitNote asAdmin used={14} limit={25} links={LINKS} />)
    expect(container.textContent).toBe("")
    rerender(<SeatLimitNote asAdmin used={140} limit={0} links={LINKS} />)
    expect(container.textContent).toBe("")
    expect(seatNoteDue(14, 25)).toBe(false)
    expect(seatNoteDue(20, 25)).toBe(true)
  })

  it("from 80%: the meter, the line and the admin's way past the limit", () => {
    render(<SeatLimitNote asAdmin used={21} limit={25} links={LINKS} variant="card" />)
    expect(screen.getByRole("status")).toHaveTextContent("Free plan: 21 of 25 people, 4 places left.")
    expect(document.querySelector("[data-seat-limit-note=card] .people-meter-fill")).toBeTruthy()
    expect(screen.getByText("Licensed workspaces have no limit and turn on company controls.")).toBeTruthy()
    const remove = screen.getByRole("link", { name: "Remove the 25-person limit" })
    expect(remove).toHaveAttribute("href", LINKS.licence)
    expect(remove).toHaveAttribute("target", "_blank")
    expect(screen.getByRole("link", { name: "Prices" })).toHaveAttribute("href", LINKS.pricing)
  })

  it("says when the people being added won't fit, even under 80%", () => {
    render(<SeatLimitNote asAdmin used={3} limit={5} sending={4} links={LINKS} />)
    expect(screen.getByRole("status")).toHaveTextContent("2 places left on the free plan. 2 of these won't fit.")
  })

  it("a member is told to ask an admin and offered no purchase", () => {
    render(<SeatLimitNote asAdmin={false} limit={25} links={LINKS} />)
    expect(screen.getByRole("status")).toHaveTextContent("This workspace's free plan is full.")
    expect(screen.getByText("Ask an admin to remove the 25-person limit.")).toBeTruthy()
    expect(screen.queryByRole("link")).toBeNull()
  })

  it("the number is the server's limit", () => {
    render(<SeatLimitNote asAdmin used={30} limit={30} links={LINKS} />)
    expect(screen.getByRole("link", { name: "Remove the 30-person limit" })).toBeTruthy()
    expect(screen.queryByText(/25/)).toBeNull()
  })

  it("says it in the caller's words when it has its own", () => {
    render(<SeatLimitNote asAdmin used={23} limit={25} links={LINKS} line="60 people came across, and your free plan has room for 2 more." />)
    expect(screen.getByRole("status")).toHaveTextContent("60 people came across, and your free plan has room for 2 more.")
  })

  it("offers no buy link when the server named none", () => {
    render(<SeatLimitNote asAdmin used={25} limit={25} />)
    expect(screen.getByRole("status")).toHaveTextContent("all 25 places are taken")
    expect(screen.queryByRole("link")).toBeNull()
  })
})
