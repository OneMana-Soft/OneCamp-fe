import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { Suspense } from "react"

vi.mock("@/services/bookingService", () => ({
  getBooking: () => Promise.resolve({ ok: true, data: { title: "Intro call with Sam", owner_name: "Sam Rivera", start: "2026-10-14T05:30:00Z", end: "2026-10-14T06:00:00Z", cancelled: false, slug: "sam-rivera" } }),
  cancelBooking: vi.fn(),
}))
vi.mock("@/lib/utils/timeZone", () => ({ browserTZ: () => "Asia/Kolkata" }))
vi.mock("@/components/public/MadeWithOneCamp", () => ({ MadeWithOneCamp: () => null }))

import ManageBooking from "./page"

afterEach(cleanup)

describe("a booking's own page", () => {
  it("names the meeting once, says who it is with on its own line, and the time with 'to'", async () => {
    await act(async () => {
      render(
        <Suspense fallback={null}>
          <ManageBooking params={Promise.resolve({ token: "t" })} />
        </Suspense>,
      )
    })
    const title = await screen.findByRole("heading", { name: "Intro call with Sam" })
    expect(title).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/with Sam with/)
    expect(screen.getByText("With Sam Rivera")).toBeTruthy()
    expect(screen.getByText(/^Wednesday 14 October, 11:00\sAM to 11:30\sAM$/)).toBeTruthy()
    // The icon is on a hue tile; the accent is left to the one action.
    expect(document.querySelector("svg.text-primary")).toBeNull()
  })
})
