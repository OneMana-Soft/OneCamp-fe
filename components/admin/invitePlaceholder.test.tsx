import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

let isAdmin = true
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: { data: { user_is_admin: isAdmin } } }),
}))
const sent: string[] = []
let emailSent = true
vi.mock("@/services/importService", async (orig) => ({
  ...(await orig<typeof import("@/services/importService")>()),
  inviteImportedPeople: vi.fn(async (people: { email: string }[]) => {
    sent.push(...people.map((p) => p.email))
    return { invited: people, alreadyInvited: [], failed: [], seatLimit: null, emailSent }
  }),
}))

const { InvitePlaceholder } = await import("./InvitePlaceholder")

afterEach(() => {
  cleanup()
  sent.length = 0
  isAdmin = true
  emailSent = true
})

describe("inviting a placeholder from their profile", () => {
  it("lets an admin invite someone whose own address came across", async () => {
    render(<InvitePlaceholder userUUID="u1" email="priya@acme.com" name="Priya" />)
    fireEvent.click(screen.getByRole("button", { name: /Invite to the workspace/ }))
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Invited. They get an email with a link to join."))
    expect(sent).toEqual(["priya@acme.com"])
    expect(screen.queryByRole("button", { name: /Invite/ })).toBeNull()
  })

  it("says where the link is when the server can't send email", async () => {
    emailSent = false
    render(<InvitePlaceholder userUUID="u1" email="priya@acme.com" />)
    fireEvent.click(screen.getByRole("button", { name: /Invite to the workspace/ }))
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/copy their link from Admin, Invitations/))
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
