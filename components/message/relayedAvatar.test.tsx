import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { RelayedAvatar } from "@/components/message/relayedAvatar"

// A guest is a person from outside: a circle with their initials on a neutral
// tint, never the Guests bot's square or its image, never a member's colour.
describe("RelayedAvatar", () => {
  afterEach(cleanup)

  it("draws the guest's initials in a neutral circle, with no image", () => {
    const { container } = render(<RelayedAvatar name="Priya (Acme)" />)
    const avatar = container.querySelector("[data-relayed-avatar]")
    expect(avatar).toBeTruthy()
    expect(avatar?.className).not.toContain("rounded-[28%]")
    expect(container.textContent).toBe("P")
    expect(container.innerHTML).toContain("bg-muted")
    expect(container.querySelector("img")).toBeNull()
  })
})
