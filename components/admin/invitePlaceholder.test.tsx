import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

let isAdmin = true
const PLAN_LINKS = {
  licence: "https://shop.example/buy?plan=lifetime",
  cloud: "https://shop.example/buy?plan=cloud",
  account: "https://shop.example/account",
  pricing: "https://shop.example/pricing",
}
/** Every address the profile asked for, in order. */
const asked: string[] = []
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) =>
    (asked.push(url), url) === "/admin/plan"
      ? { data: { data: { plan: "free", used: 25, limit: 25, free_plan: true, locked: [], controls: [], links: PLAN_LINKS } }, mutate: vi.fn() }
      : { data: url ? { data: { user_is_admin: isAdmin } } : undefined },
}))
const sent: string[] = []
let unsent: string | null = null
let full = false
vi.mock("@/services/importService", async (orig) => ({
  ...(await orig<typeof import("@/services/importService")>()),
  inviteImportedPeople: vi.fn(async (people: { email: string }[]) => {
    sent.push(...people.map((p) => p.email))
    if (full) return { invited: [], alreadyInvited: [], failed: [], seatLimit: { msg: "This workspace is on OneCamp's free plan, which has room for 25 people, and it is full.", notInvited: people }, notEmailed: [], unsentMsg: null }
    return { invited: people, alreadyInvited: [], failed: [], seatLimit: null, notEmailed: unsent === null ? [] : people, unsentMsg: unsent }
  }),
}))

const { InvitePlaceholder } = await import("./InvitePlaceholder")

afterEach(() => {
  cleanup()
  sent.length = 0
  isAdmin = true
  unsent = null
  full = false
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

  // The plan's limit is a note with the way past it, not an error in red (ADMIN-02).
  it("a seat refusal is the note, not an error", async () => {
    full = true
    render(<InvitePlaceholder userUUID="u1" email="priya@acme.com" name="Priya" />)
    fireEvent.click(screen.getByRole("button", { name: /Invite to the workspace/ }))
    expect(await screen.findByRole("link", { name: "Remove the 25-person limit" })).toHaveAttribute("href", PLAN_LINKS.licence)
    expect(screen.getByRole("status")).toHaveTextContent("all 25 places are taken")
    expect(screen.queryByRole("alert")).toBeNull()
  })

  // CR-248 A20: the hook runs before the admin check, so without its gate every
  // profile a member opens would ask the admin-only /admin/plan and meet a 403.
  it("reads the plan only after a seat refusal, never on opening a profile", async () => {
    for (const admin of [false, true]) {
      isAdmin = admin
      asked.length = 0
      render(<InvitePlaceholder userUUID="u1" email="priya@acme.com" />)
      expect(asked.length).toBeGreaterThan(0)
      expect(asked).not.toContain("/admin/plan")
      cleanup()
    }
    isAdmin = true
    full = true
    asked.length = 0
    render(<InvitePlaceholder userUUID="u1" email="priya@acme.com" />)
    fireEvent.click(screen.getByRole("button", { name: /Invite to the workspace/ }))
    await screen.findByRole("link", { name: "Remove the 25-person limit" })
    expect(asked).toContain("/admin/plan")
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
