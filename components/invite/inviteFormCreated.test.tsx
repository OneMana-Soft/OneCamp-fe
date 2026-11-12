import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// A round that made at least one invitation tells its dialog so, once: Admin ›
// People refreshes its list and its seat meter on it (AddInvitationDialog's
// onCreated). A round the server refused whole changed nothing to refresh.

const invite = vi.fn()
vi.mock("@/services/invitationService", () => ({ invite }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("@/hooks/useCopyToClipboard", () => ({ useCopyToClipboard: () => ({ copied: false, copy: vi.fn(async () => true) }) }))

const { InviteForm } = await import("./InviteForm")

afterEach(() => {
  cleanup()
  invite.mockReset()
})

async function round(answers: unknown[], emailOn = true) {
  for (const a of answers) invite.mockResolvedValueOnce(a)
  const onCreated = vi.fn()
  render(<InviteForm asAdmin emailOn={emailOn} onCreated={onCreated} onClose={vi.fn()} header={({ summary }) => <p>{summary}</p>} />)
  fireEvent.paste(screen.getByLabelText(/email address/i), { clipboardData: { getData: () => "ana@example.com, bo@example.com" } })
  fireEvent.submit(screen.getByRole("button", { name: `${emailOn ? "Send" : "Create"} 2 invitations` }).closest("form")!)
  return onCreated
}

describe("a round of invitations and the list it refreshes", () => {
  it("says it made invitations exactly once when one was made and one refused", async () => {
    const onCreated = await round([
      { ok: true, answer: { email_sent: true, invite_link: "https://x/a" } },
      { ok: false, msg: "bo@example.com is already a member of this workspace." },
    ])
    expect(await screen.findByText("1 sent · 1 refused")).toBeTruthy()
    expect(onCreated).toHaveBeenCalledTimes(1)
  })

  it("never says so when every address was refused", async () => {
    const onCreated = await round([
      { ok: false, msg: "ana@example.com is already a member of this workspace." },
      { ok: false, msg: "bo@example.com is already a member of this workspace." },
    ])
    expect(await screen.findByText("2 refused")).toBeTruthy()
    expect(onCreated).not.toHaveBeenCalled()
  })
})

// With email off, the line over the rows ("Email isn't set up yet. Share these
// links…") is about links the round made (CR-250 F1). A round the server
// refused whole made none: the line would point at links that aren't there,
// and each row's own reason is the answer.
describe("a round on a server that can't send email", () => {
  it("never says to share links when every address was refused, and each row keeps its reason", async () => {
    await round(
      [
        { ok: false, msg: "ana@example.com is already a member of this workspace." },
        { ok: false, msg: "bo@example.com has a pending invitation already." },
      ],
      false,
    )
    expect(await screen.findByText("2 refused")).toBeTruthy()
    expect(screen.queryByText(/Email isn't set up yet/)).toBeNull()
    expect(screen.queryByText(/Share these links/)).toBeNull()
    const rows = [...document.querySelectorAll("[data-invite-result='refused']")].map((r) => r.textContent)
    expect(rows).toEqual([
      expect.stringContaining("ana@example.com is already a member of this workspace."),
      expect.stringContaining("bo@example.com has a pending invitation already."),
    ])
  })
})
