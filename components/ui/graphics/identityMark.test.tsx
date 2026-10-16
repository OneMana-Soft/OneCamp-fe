import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { hueFor } from "@/lib/campHue"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { Tile } from "@/components/ui/graphics/Tile"

afterEach(cleanup)

/**
 * A thing's mark is its hue, in one of four shapes. The hue comes from the id
 * (or a colour the owner picked), so the same project is the same colour in
 * the sidebar, on the board and on the calendar.
 */
describe("IdentityMark", () => {
  const id = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"

  it("draws a dot in the id's hue, decorative beside the name", () => {
    const { container } = render(<IdentityMark id={id} />)
    const svg = container.querySelector("svg")!
    expect(svg.getAttribute("class")).toContain(`hue-${hueFor(id)}`)
    expect(svg.getAttribute("class")).toContain("fill-hue")
    expect(svg.querySelector("circle")).not.toBeNull()
    expect(svg.getAttribute("aria-hidden")).toBe("true")
    expect(svg.getAttribute("width")).toBe("8")
  })

  it("draws a square for a project", () => {
    const { container } = render(<IdentityMark id={id} variant="square" />)
    expect(container.querySelector("svg rect")).not.toBeNull()
  })

  it("lets a chosen colour win, and an explicit hue win over that", () => {
    const { container, rerender } = render(<IdentityMark id={id} chosen="#EC4899" />)
    expect(container.querySelector("svg")!.getAttribute("data-hue")).toBe("berry")
    rerender(<IdentityMark id={id} chosen="#EC4899" hue="moss" />)
    expect(container.querySelector("svg")!.getAttribute("data-hue")).toBe("moss")
  })

  it("draws a person without a photo as the saturated avatar cut with white initials", () => {
    const { getByText } = render(<IdentityMark variant="avatar" id="Maya Chen" label="Maya Chen" />)
    const initials = getByText("MC")
    expect(initials.className).toContain(`hue-${hueFor("Maya Chen")}`)
    expect(initials.className).toContain("avatar-person")
    // 37.5% of the size: 12px at the default 32.
    expect(initials.style.fontSize).toBe("12px")
  })

  // A person is one colour on every screen (app/personHue.test.ts). Their
  // message avatars, mentions and quote bars key on the name they go by, so a
  // mark is keyed by avatarSeed(person), never their uuid; the id decides only
  // for someone with no name, and a colour they picked wins over both.
  it("keys a person on their name, the id only when there is none, and a picked colour first", async () => {
    const { avatarSeed, getAvatarFallbackClass, personHue } = await import("@/lib/utils/getAvatarColor")
    const uuid = "6749f365-be78-4f82-97be-6db442070dbd"
    const maya = { user_uuid: uuid, user_name: "Maya Chen" }
    const { getByText } = render(<IdentityMark variant="avatar" id={avatarSeed(maya)} label="Maya Chen" />)
    expect(getByText("MC").className).toContain(`hue-${hueFor("Maya Chen")}`)
    expect(getAvatarFallbackClass("Maya Chen")).toContain(`hue-${personHue(maya)}`)
    expect(avatarSeed({ user_uuid: uuid })).toBe(uuid)
    expect(personHue({ user_uuid: uuid })).toBe(hueFor(uuid))
    expect(personHue(maya, "#EC4899")).toBe("berry")
  })

  it("shows one initial below 24px, two from there up", () => {
    const { getByText } = render(<IdentityMark variant="avatar" id="Maya Chen" label="Maya Chen" size={20} />)
    expect(getByText("M")).toBeTruthy()
  })

  it("names itself only when asked to, for a mark that stands alone", () => {
    const { getByRole } = render(<IdentityMark variant="avatar" id="Sam Rivera" label="Sam Rivera" aria-label="Sam Rivera" />)
    expect(getByRole("img", { name: "Sam Rivera" })).toBeTruthy()
  })

  it("puts an icon on a tint tile, or the name's first letter in ink", () => {
    const { container, rerender } = render(<IdentityMark variant="tile" hue="sky" icon={<svg data-testid="glyph" />} />)
    const tile = container.firstElementChild as HTMLElement
    expect(tile.className).toContain("hue-sky")
    expect(tile.className).toContain("bg-hue-tint")
    expect(tile.className).toContain("text-hue")
    expect(tile.querySelector("[data-testid=glyph]")).not.toBeNull()
    rerender(<IdentityMark variant="tile" hue="sky" label="Design" />)
    expect(container.textContent).toBe("D")
    expect(container.querySelector("span span")!.className).toContain("text-hue-ink")
  })
})

describe("Tile", () => {
  it("sits on the card radius at 32 and 40, and the control radius at 24", () => {
    const { container, rerender } = render(<Tile hue="moss" />)
    expect((container.firstElementChild as HTMLElement).className).toContain("rounded-lg")
    rerender(<Tile hue="moss" size="sm" />)
    expect((container.firstElementChild as HTMLElement).className).toContain("rounded-md")
  })
})
