import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { hueFor } from "@/lib/campHue"

vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))

import { ActiveUsersBar } from "./ActiveUsersBar"

afterEach(cleanup)

const users = [
  { id: "289b6b5d-c30c-427a-bcec-634cb294f285", name: "Sam Rivera", color: "#123456" },
  { id: "b5c0a8f1-0000-4000-8000-000000000002", name: "Maya Chen", color: "#654321" },
]

// Someone's face here is the one they have everywhere: their identity hue,
// from their id, not the random colour their own browser announced.
describe("the faces of who is here", () => {
  it("draws each person in their identity hue, named for a screen reader", () => {
    render(
      <TooltipProvider>
        <ActiveUsersBar users={users} />
      </TooltipProvider>,
    )
    for (const u of users) {
      const face = screen.getByRole("img", { name: u.name })
      expect(face.querySelector("[data-hue]")?.getAttribute("data-hue")).toBe(hueFor(u.id))
      expect(face.innerHTML).not.toMatch(/background-color/)
    }
    expect(screen.getByText("SR")).toBeTruthy()
  })

  it("counts the rest, and names them", () => {
    render(
      <TooltipProvider>
        <ActiveUsersBar users={[...users, { id: "c", name: "Jonas Weber", color: "" }]} maxShown={2} />
      </TooltipProvider>,
    )
    expect(screen.getByRole("img", { name: "1 more: Jonas Weber" }).textContent).toBe("+1")
  })
})
