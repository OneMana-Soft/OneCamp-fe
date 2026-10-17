import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))

import { AccessCard, CopyLinkButton, GeneralAccessMark, InviteRow, ShareTokenInvite, ShareUserRow, generalAccessLine, withoutOwner } from "./shareParts"

afterEach(cleanup)

const sam = { user_uuid: "u1", user_full_name: "Sam Rivera" } as never
const maya = { user_uuid: "u2", user_full_name: "Maya Chen", user_email_id: "maya@acme.test" } as never
const ROLES = [{ value: "editor", label: "Can edit" }, { value: "viewer", label: "Can view" }]

// The share dialog in v3 (content.md D18): sentence case, one primary (Invite,
// and only once someone is picked), Copy link secondary, access as cards.
describe("the share dialogs' source", () => {
  for (const f of ["components/dialog/shareParts.tsx", "components/dialog/docShareDialog.tsx", "components/dialog/boardShareDialog.tsx"]) {
    it(`${f} has no uppercase eyebrow and no second primary`, () => {
      const src = readFileSync(f, "utf8")
      expect(src).not.toMatch(/\buppercase\b|eyebrowClass/)
      expect(src).not.toMatch(/<Button onClick=\{[^}]*\}>Done/)
    })
  }
})

describe("the invite row", () => {
  it("shows Invite, the one primary, only once someone is picked", async () => {
    vi.useFakeTimers()
    const search = vi.fn().mockResolvedValue([maya, sam])
    const onInvite = vi.fn().mockResolvedValue(undefined)
    render(<ShareTokenInvite search={search} roles={ROLES} defaultRole="editor" existing={new Set(["u1"])} onInvite={onInvite} />)
    expect(screen.queryByRole("button", { name: "Invite" })).toBeNull()
    fireEvent.change(screen.getByRole("combobox", { name: "Add people" }), { target: { value: "ma" } })
    await act(async () => { await vi.advanceTimersByTimeAsync(350) })
    vi.useRealTimers()
    // Someone with access already says so and can't be picked.
    expect(screen.getByText("Already has access")).toBeTruthy()
    fireEvent.click(screen.getByRole("option", { name: /Maya Chen/ }))
    const invite = screen.getByRole("button", { name: "Invite" })
    expect(document.querySelectorAll("[data-share-chip]")).toHaveLength(1)
    await act(async () => fireEvent.click(invite))
    expect(onInvite).toHaveBeenCalledWith([maya], "editor")
    expect(screen.queryByRole("button", { name: "Invite" })).toBeNull()
  })

  // Review, 15 Oct 2026: typing a name in Japanese, the Enter that picks the
  // word picked whoever was highlighted, or sent the invites (lib/keys/ime.ts).
  // Safari's says keyCode 229 and not isComposing.
  it("leaves an input method's Enter to pick its word, never a person", async () => {
    vi.useFakeTimers()
    const onInvite = vi.fn().mockResolvedValue(undefined)
    render(<ShareTokenInvite search={vi.fn().mockResolvedValue([maya])} roles={ROLES} defaultRole="editor" existing={new Set()} onInvite={onInvite} />)
    const box = screen.getByRole("combobox", { name: "Add people" })
    fireEvent.change(box, { target: { value: "ma" } })
    await act(async () => { await vi.advanceTimersByTimeAsync(350) })
    vi.useRealTimers()
    fireEvent.keyDown(box, { key: "Enter", isComposing: true })
    fireEvent.keyDown(box, { key: "Enter", keyCode: 229 })
    expect(document.querySelectorAll("[data-share-chip]")).toHaveLength(0)
    expect(onInvite).not.toHaveBeenCalled()
    fireEvent.keyDown(box, { key: "Enter" })
    expect(document.querySelectorAll("[data-share-chip]")).toHaveLength(1)
  })

  it("and the doc's invite row, with teams, leaves it too", async () => {
    vi.useFakeTimers()
    const onInvite = vi.fn().mockResolvedValue(undefined)
    render(
      <InviteRow
        searchPeople={vi.fn().mockResolvedValue([maya])}
        teams={[{ team_uuid: "t1", team_name: "Marketing" }]}
        levels={["edit", "view"]}
        defaultLevel="edit"
        existing={new Set()}
        onInvite={onInvite}
      />,
    )
    const box = screen.getByRole("combobox", { name: "Add people or teams" })
    fireEvent.change(box, { target: { value: "ma" } })
    await act(async () => { await vi.advanceTimersByTimeAsync(350) })
    vi.useRealTimers()
    fireEvent.keyDown(box, { key: "Enter", isComposing: true })
    fireEvent.keyDown(box, { key: "Enter", keyCode: 229 })
    expect(document.querySelectorAll("[data-share-chip]")).toHaveLength(0)
    expect(onInvite).not.toHaveBeenCalled()
    fireEvent.keyDown(box, { key: "Enter" })
    expect(document.querySelectorAll("[data-share-chip]")).toHaveLength(1)
  })
})

describe("a person with access", () => {
  it("is a row whose role is a menu (Remove access lives there); the owner's is plain text", () => {
    render(
      <div>
        <ShareUserRow user={sam} role="owner" roles={ROLES} canEdit={false} />
        <ShareUserRow user={maya} role="editor" roles={ROLES} canEdit onRemove={() => {}} />
      </div>,
    )
    const roles = [...document.querySelectorAll("[data-share-role]")] as HTMLElement[]
    expect(roles.map((r) => r.textContent)).toEqual(["Owner", "Can edit"])
    expect(roles[0].tagName).toBe("SPAN")
    expect(roles[1].tagName).toBe("BUTTON")
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull()
    expect(document.querySelectorAll("[data-share-row] [data-hue]").length).toBe(2)
  })

  it("lists the owner once", () => {
    expect(withoutOwner([{ user_uuid: "u1" }, { user_uuid: "u2" }], "u1")).toEqual([{ user_uuid: "u2" }])
  })
})

describe("general access", () => {
  it("says what it does: the workspace, not the internet", () => {
    for (const v of ["public", "public_comment"] as const) {
      expect(generalAccessLine(v, "doc")).toMatch(/workspace/)
      expect(generalAccessLine(v, "doc")).not.toMatch(/internet/)
    }
    expect(generalAccessLine("restricted", "board")).toMatch(/^Only the people above/)
  })

  it("is a card that renders a Tile, sky for the workspace, never the accent", () => {
    const { container } = render(<AccessCard tile={<GeneralAccessMark value="public" />} label="Everyone in the workspace" description="x" />)
    expect(container.querySelector("[data-access-card]")?.className).toMatch(/bg-sunken/)
    expect(container.innerHTML).not.toMatch(/primary/)
    expect(container.querySelector("[class*='hue-sky']")).toBeTruthy()
  })

  it("offers Copy link as a secondary button", () => {
    render(<CopyLinkButton />)
    const b = screen.getByRole("button", { name: "Copy link" })
    expect(b.className).toMatch(/bg-raised|shadow-e1/)
    expect(b.className).not.toMatch(/bg-primary/)
  })
})
