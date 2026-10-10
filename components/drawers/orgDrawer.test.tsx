import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// The workspace menu's places sit on tiles in their hue, as in the More menu.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: { data: { user_is_admin: true } } }) }))

import { OrgDrawer } from "./orgDrawer"
import { destinationHue } from "@/lib/destinationHue"

afterEach(() => cleanup())

describe("the workspace menu", () => {
  it("sets Teams, Projects and Admin on tiles in their places' hues", () => {
    render(<OrgDrawer drawerOpenState={true} setOpenState={() => {}} />)
    for (const [name, path] of [["Teams", "/app/team"], ["Projects", "/app/project"], ["Admin", "/app/admin"]]) {
      const tile = screen.getByRole("button", { name: new RegExp(`^${name}`) }).querySelector("span[aria-hidden='true']")
      expect(tile?.className, name).toContain(`hue-${destinationHue(path)}`)
    }
  })
})
