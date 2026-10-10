import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { Suspense } from "react"
import { hueFor } from "@/lib/campHue"

let answer: (v: unknown) => void = () => {}
vi.mock("@/services/bookingService", () => ({
  getBookingPage: () => new Promise((r) => (answer = r)),
  bookSlot: vi.fn(),
}))
vi.mock("@/components/public/MadeWithOneCamp", () => ({ MadeWithOneCamp: () => null }))

import BookingPage from "./page"

afterEach(cleanup)

const PAGE = {
  slug: "sam-rivera",
  title: "Intro call with Sam",
  description: "",
  duration_minutes: 30,
  owner_name: "Sam Rivera",
  owner_tz: "UTC",
  slots: [{ start: "2026-10-12T13:00:00Z", end: "2026-10-12T13:30:00Z" }],
  bookable_until: "2026-10-12T00:00:00Z",
}

async function open() {
  const params = Promise.resolve({ slug: "sam-rivera" })
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <BookingPage params={params} />
      </Suspense>,
    )
  })
}

describe("a public booking page", () => {
  it("loads in the shape of its card, not as a spinner in an empty page", async () => {
    await open()
    expect(screen.getByRole("status", { name: "Loading booking page" })).toBeTruthy()
    expect(document.querySelector(".animate-spin")).toBeNull()
  })

  it("shows the host as the app draws a person: initials on their own hue", async () => {
    await open()
    await act(async () => answer({ ok: true, data: PAGE }))
    expect(screen.getByRole("heading", { name: "Intro call with Sam" })).toBeTruthy()
    const mark = document.querySelector("[data-hue]")
    expect(mark?.getAttribute("data-hue")).toBe(hueFor("Sam Rivera"))
    expect(mark?.textContent).toBe("SR")
  })
})
