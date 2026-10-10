import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

let isAdmin = true
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: { data: { user_is_admin: isAdmin } } }),
}))
const sent: string[] = []
let unsent: string | null = null
vi.mock("@/services/importService", async (orig) => ({
  ...(await orig<typeof import("@/services/importService")>()),
  inviteImportedPeople: vi.fn(async (people: { email: string }[]) => {
    sent.push(...people.map((p) => p.email))
    return { invited: people, alreadyInvited: [], failed: [], seatLimit: null, notEmailed: unsent === null ? [] : people, unsentMsg: unsent }
  }),
}))

const { InvitePlaceholder } = await import("./InvitePlaceholder")

afterEach(() => {
  cleanup()
  sent.length = 0
  isAdmin = true
  unsent = null
})

describe("inviting a placeholder from their profile", () => {
  it("lets an admin invite someone whose own address came across", async () => {
    render(<InvitePlaceholder userUUID="u1" email="priya@acme.com" name="Priya" />)
    fireEvent.click(screen.getByRole("button", { name: /Invite to the workspace/ }))
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Invited. They get an email with a link to join."))
    expect(sent).toEqual(["priya@acme.com"])
    expect(screen.queryByRole("button", { name: /Invite/ })).toBeNull()
  })

  it("says why no email went, in the server's words", async () => {
    unsent = "Invitation created. Today's emails are used up (a few are kept for password resets), so share the link yourself, or resend it tomorrow."
    render(<InvitePlaceholder userUUID="u1" email="priya@acme.com" />)
    fireEvent.click(screen.getByRole("button", { name: /Invite to the workspace/ }))
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(unsent))
  })

  it("explains instead when their address was made up", () => {
    render(<InvitePlaceholder userUUID="u1" email="trello-import-board-5@no-reply.local" />)
    expect(screen.getByText(/No email address came across with them/)).toBeTruthy()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("shows nothing to someone who isn't an admin", () => {
    isAdmin = false
    const { container } = render(<InvitePlaceholder userUUID="u1" email="priya@acme.com" />)
    expect(container.textContent).toBe("")
  })
})

describe("where an unsent invitation's link is", () => {
  // The app names places as "Admin, Invitations" (the menu's own words); an
  // arrow path read as a different place.
  it("says Admin, Invitations, in the app's words", async () => {
    const { placeholderInviteAnswer } = await import("./InvitePlaceholder")
    const answer = placeholderInviteAnswer({ invited: [{ user_id: "u1", name: "P", email: "p@x" }], alreadyInvited: [], failed: [], seatLimit: null, notEmailed: [{ user_id: "u1", name: "P", email: "p@x" }], unsentMsg: null })
    expect(answer.text).toContain("Admin, Invitations")
    expect(answer.text).not.toContain("→")
  })
})
