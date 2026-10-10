import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

const { fetched, mutate } = vi.hoisted(() => ({
  fetched: { current: { data: undefined as unknown, isLoading: false, isError: false } },
  mutate: vi.fn(),
}))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ ...fetched.current, mutate }) }))

import GitHubWebhookHealth, { deliverySentence } from "@/components/admin/GitHubWebhookHealth"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  fetched.current = { data: undefined, isLoading: false, isError: false }
})

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

describe("GitHub webhook deliveries", () => {
  // Three stat tiles in a grid said what one sentence says.
  it("says the day's deliveries in a sentence, not a grid of numbers", () => {
    fetched.current.data = {
      health: {
        completed_24h: 40,
        failed_24h: 2,
        processing_24h: 1,
        last_completed_at: ago(5),
        last_failed_at: ago(120),
        last_error_message: "Bad signature",
      },
    }
    const { container } = render(<GitHubWebhookHealth />)
    expect(screen.getByText("In the last 24 hours, 40 deliveries went through, 2 failed and 1 is still being processed.")).toBeTruthy()
    expect(screen.getByText("2 failed in 24 hours")).toBeTruthy()
    expect(screen.getByText("Bad signature")).toBeTruthy()
    expect(container.querySelector(".text-2xl")).toBeNull()
    expect(container.querySelector(".grid")).toBeNull()
  })

  it("puts the counts into words, singular and plural", () => {
    expect(deliverySentence(null)).toBe("No deliveries in the last 24 hours.")
    expect(deliverySentence({ completed_24h: 1, failed_24h: 0, processing_24h: 0 })).toBe(
      "In the last 24 hours, 1 delivery went through.",
    )
    expect(deliverySentence({ completed_24h: 0, failed_24h: 3, processing_24h: 2 })).toBe(
      "In the last 24 hours, none went through, 3 failed and 2 are still being processed.",
    )
  })

  it("says the deliveries couldn't be loaded, with Try again", () => {
    fetched.current.isError = true
    render(<GitHubWebhookHealth />)
    // The compact form every section's failed read takes, under its title.
    expect(screen.getByText("Couldn't load the webhook deliveries")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(mutate).toHaveBeenCalled()
  })
})
