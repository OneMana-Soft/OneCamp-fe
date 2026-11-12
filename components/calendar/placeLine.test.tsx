import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { PlaceLine } from "@/components/calendar/placeLine"

// An event's place (calendar head B, gcal-1a), one line wherever it is read: the pop card, the agenda and the
// event's page. A room or an address opens a map; a web address opens itself; both in a new tab, with no opener.
afterEach(cleanup)

describe("the place line", () => {
  it("opens a room on a map in a new tab", () => {
    render(<PlaceLine place="Studio, second floor" />)
    const link = screen.getByRole("link", { name: /Studio, second floor/ })
    expect(link.getAttribute("href")).toBe("https://www.google.com/maps/search/?api=1&query=Studio%2C%20second%20floor")
    expect(link.getAttribute("target")).toBe("_blank")
    expect(link.getAttribute("rel")).toBe("noopener noreferrer")
    expect(link.getAttribute("aria-label")).toBe("Studio, second floor, on a map (opens in a new tab)")
    expect(link.querySelector("svg")).toBeTruthy()
  })

  it("opens a web address as itself", () => {
    render(<PlaceLine place="meet.example.com/abc" />)
    const link = screen.getByRole("link", { name: /meet\.example\.com\/abc/ })
    expect(link.getAttribute("href")).toBe("https://meet.example.com/abc")
    expect(link.getAttribute("aria-label")).toBe("meet.example.com/abc (opens in a new tab)")
  })

  it("draws nothing for no place", () => {
    const { container } = render(<PlaceLine place="  " />)
    expect(container.innerHTML).toBe("")
  })
})
