import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))

import { CopyLinkButton, GeneralAccessMark, ShareUserRow, generalAccessLine, withoutOwner } from "./shareParts"

afterEach(cleanup)

const sam = { user_uuid: "u1", user_full_name: "Sam Rivera" } as never
const maya = { user_uuid: "u2", user_full_name: "Maya Chen" } as never

describe("a share dialog's people", () => {
  it("ends every role on one line, with or without a remove button, and faces in their hues", () => {
    render(
      <div>
        <ShareUserRow user={sam} role="owner" canRemove={false} />
        <ShareUserRow user={maya} role="editor" canRemove onRemove={() => {}} />
      </div>,
    )
    const roles = [...document.querySelectorAll("[data-share-role]")] as HTMLElement[]
    expect(roles.map((r) => r.textContent)).toEqual(["Owner", "Editor"])
    for (const r of roles) {
      expect(r.className).toMatch(/\bw-20\b/)
      // The slot after the role is there on both rows.
      expect((r.nextElementSibling as HTMLElement).className).toMatch(/\bw-6\b/)
    }
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

  it("marks open access on a hue tile, never the accent", () => {
    const { container } = render(<GeneralAccessMark restricted={false} />)
    expect(container.innerHTML).not.toMatch(/primary/)
    expect(container.querySelector("[class*='hue-sky']")).toBeTruthy()
  })

  it("offers Copy link in sentence case, as a quiet button", () => {
    render(<CopyLinkButton />)
    const b = screen.getByRole("button", { name: "Copy link" })
    expect(b.className).not.toMatch(/rounded-full|text-primary/)
  })
})
