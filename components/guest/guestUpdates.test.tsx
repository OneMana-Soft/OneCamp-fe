import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { GuestUpdates } from "./GuestUpdates"
import type { GuestUpdate } from "@/services/guestService"

const update = (body: string, created_at: string): GuestUpdate =>
  ({ health: "on_track", health_label: "On track", body, author: "Priya Raman", created_at }) as GuestUpdate

describe("the team's updates on a client's project", () => {
  afterEach(() => cleanup())

  it("opens the earlier ones from a button the keyboard can see", () => {
    render(<GuestUpdates updates={[update("Build is two days ahead.", "2026-10-08T16:00:00Z"), update("Design signed off.", "2026-10-01T16:00:00Z")]} />)
    const more = screen.getByRole("button", { name: "Show 1 earlier update" })
    expect(more.className).toMatch(/focus-visible:ring-2/)
    fireEvent.click(more)
    expect(screen.getByText("Design signed off.")).toBeInTheDocument()
  })
})
