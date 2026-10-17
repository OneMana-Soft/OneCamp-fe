import { afterEach, describe, expect, it, vi } from "vitest"

vi.stubEnv("NEXT_PUBLIC_PRODUCT_SITE", "https://site.example.test")
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"

// The workspace menu's places sit on tiles in their hue, as in the More menu.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }))
let admin = true
let caps: string[] = []
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: { data: { user_is_admin: admin } } }) }))
vi.mock("@/hooks/useCapabilities", () => ({ useCapabilities: () => ({ can: (c: string) => caps.includes(c) }) }))
let invite: { open: boolean; onOpenChange: (o: boolean) => void } | null = null
vi.mock("@/components/invite/MemberInviteDialog", () => ({
  MemberInviteDialog: (p: { open: boolean; onOpenChange: (o: boolean) => void }) => {
    invite = p
    return p.open ? <div data-testid="invite-dialog" /> : null
  },
}))

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

  // The UI manager unmounts the sheet when it closes (UnifiedUIManager), and
  // the invite dialog lived inside it: the row opened the dialog and closed
  // the sheet in one go, so on a phone "Invite people" did nothing at all.
  it("hands over to the invite dialog, and closes only once that is done", () => {
    caps = ["invitation.create"]
    function AsTheUIManagerMountsIt() {
      const [open, setOpen] = useState(true)
      return open ? <OrgDrawer drawerOpenState={open} setOpenState={setOpen} /> : null
    }
    render(<AsTheUIManagerMountsIt />)
    fireEvent.click(screen.getByRole("button", { name: /^Invite people/ }))
    expect(screen.getByTestId("invite-dialog")).toBeTruthy()
    act(() => invite!.onOpenChange(false))
    expect(screen.queryByTestId("invite-dialog")).toBeNull()
    expect(document.querySelector("[data-phone-sheet]")).toBeNull()
  })
})
