import { afterEach, describe, expect, it, vi } from "vitest"

vi.stubEnv("NEXT_PUBLIC_PRODUCT_SITE", "https://site.example.test")
import { cleanup, render, screen } from "@testing-library/react"

// The workspace menu's places sit on tiles in their hue, as in the More menu.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }))
let admin = true
let caps: string[] = []
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: { data: { user_is_admin: admin } } }) }))
vi.mock("@/hooks/useCapabilities", () => ({ useCapabilities: () => ({ can: (c: string) => caps.includes(c) }) }))
vi.mock("@/components/invite/MemberInviteDialog", () => ({ MemberInviteDialog: () => null }))

import { OrgDrawer } from "./orgDrawer"
import { destinationHue } from "@/lib/destinationHue"

afterEach(() => {
  cleanup()
  admin = true
  caps = []
})

describe("the workspace menu", () => {
  it("sets Teams, Projects and Admin on tiles in their places' hues", () => {
    render(<OrgDrawer drawerOpenState={true} setOpenState={() => {}} />)
    for (const [name, path] of [["Teams", "/app/team"], ["Projects", "/app/project"], ["Admin", "/app/admin"]]) {
      const tile = screen.getByRole("button", { name: new RegExp(`^${name}`) }).querySelector("span[aria-hidden='true']")
      expect(tile?.className, name).toContain(`hue-${destinationHue(path)}`)
    }
  })

  it("is the v3 sheet, headed by the workspace's mark and name", () => {
    render(<OrgDrawer drawerOpenState={true} setOpenState={() => {}} />)
    const sheet = document.querySelector("[data-phone-sheet]") as HTMLElement
    expect(sheet.className.split(/\s+/)).toEqual(expect.arrayContaining(["bg-pop", "shadow-e4"]))
    expect(sheet.querySelector("[data-org-head] [data-phone-mark]")).not.toBeNull()
  })

  it("carries the workspace menu's items, with Admin and Invite only for those who may", () => {
    caps = ["invitation.create"]
    render(<OrgDrawer drawerOpenState={true} setOpenState={() => {}} />)
    expect(screen.getByRole("button", { name: /^Invite people/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: /^Help and docs/ })).toBeTruthy()
    for (const b of screen.getAllByRole("button")) expect(b.className.split(/\s+/)).toEqual(expect.arrayContaining([expect.stringMatching(/^(h-11|min-h-14)$/)]))
    cleanup()
    admin = false
    caps = []
    render(<OrgDrawer drawerOpenState={true} setOpenState={() => {}} />)
    expect(screen.queryByRole("button", { name: /^Admin/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /^Invite people/ })).toBeNull()
  })
})
