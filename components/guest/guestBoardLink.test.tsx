import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// miro-33: a board's link for a guest: its password first (C6's prompt, the
// server's three refusals), the guest's name before they comment or draw, a
// view link with no comment box, and every reconnect asking again (a new
// role, a new password, a link turned off).
const ask = vi.fn()
vi.mock("@/services/guestService", () => ({
  getGuestCollabSession: (...a: unknown[]) => ask(...a),
}))
vi.mock("@/services/guestBoardLinks", () => ({ askGuestBoardComment: vi.fn() }))
type ViewerProps = { tokenFetcher: () => Promise<string>; user?: { id: string; name: string }; link?: { role: string; unlock?: string; side?: unknown } }
const seen = vi.hoisted(() => ({ viewer: null as null | ViewerProps }))
vi.mock("next/dynamic", () => ({
  default: () => (p: ViewerProps) => {
    seen.viewer = p
    return <div data-viewer={p.link?.role ?? ""} />
  },
}))

import { GuestBoardLink, guestTokenWho } from "./GuestBoardLink"

const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")
const jwt = (name: string) => `${b64({ alg: "HS256" })}.${b64({ sub: "guest-g1", name, guest: true })}.sig`
const open = (capability: string, extra: object = {}) => ({
  ok: true,
  data: { collab_token: jwt("Guest: Priya"), document_name: "board:b1", resource_type: "board", resource_id: "b1", capability, title: "Kickoff", ...extra },
})
const refused = (status: number, msg: string, code?: string) => ({ ok: false, status, msg, code })
const NEEDS = refused(401, "This link needs its password.", "password_needed")

describe("a board's link, for its guest (miro-33)", () => {
  beforeEach(() => {
    localStorage.clear()
    seen.viewer = null
  })
  afterEach(() => {
    cleanup()
    ask.mockReset()
  })

  it("reads who the server's token says the guest is, marked as a guest", () => {
    expect(guestTokenWho(jwt("Guest: Priya"))).toEqual({ id: "guest-g1", name: "Guest: Priya" })
    expect(guestTokenWho("not-a-token")).toBeNull()
  })

  it("asks for the password, says each refusal in the server's words, then opens with the unlock", async () => {
    ask
      .mockResolvedValueOnce(NEEDS)
      .mockResolvedValueOnce(refused(401, "That password doesn't open this link.", "wrong_password"))
      .mockResolvedValueOnce(refused(429, "Too many tries. Wait a few minutes and try again.", "rate_limited"))
      .mockResolvedValueOnce(open("view", { unlock: "u1" }))
    render(<GuestBoardLink token="tok" />)
    expect(await screen.findByText("This link needs its password.")).toBeInTheDocument()
    const field = screen.getByLabelText("Password")
    const submit = () => act(async () => fireEvent.submit(field.closest("form")!))
    fireEvent.change(field, { target: { value: "wrong-one" } })
    await submit()
    expect(await screen.findByText("That password doesn't open this link.")).toBeInTheDocument()
    await submit()
    expect(await screen.findByText("Too many tries. Wait a few minutes and try again.")).toBeInTheDocument()
    fireEvent.change(field, { target: { value: "open-sesame" } })
    await submit()
    await waitFor(() => expect(seen.viewer?.link?.unlock).toBe("u1"))
    expect(ask).toHaveBeenCalledWith("tok", "", { password: "open-sesame" })
    // Every reconnect carries the unlock, never the password.
    ask.mockResolvedValueOnce(open("view", { unlock: "u1" }))
    await act(async () => void (await seen.viewer!.tokenFetcher()))
    expect(ask).toHaveBeenLastCalledWith("tok", "", { unlock: "u1" })
  })

  it("opens a view link at once, with no comment box and no name asked", async () => {
    ask.mockResolvedValue(open("view"))
    render(<GuestBoardLink token="tok" />)
    await waitFor(() => expect(seen.viewer?.link?.role).toBe("view"))
    expect(seen.viewer?.link?.side).toBeUndefined()
    expect(screen.queryByLabelText("Your name, as the team will see it")).toBeNull()
  })

  it("names the view role as the owner's picker does", async () => {
    ask.mockResolvedValue(open("view"))
    render(<GuestBoardLink token="tok" />)
    await waitFor(() => expect(seen.viewer?.link?.role).toBe("view"))
    expect(document.querySelector("[data-link-role]")?.textContent).toBe("Can view")
    expect(screen.queryByText("Read only")).toBeNull()
  })

  it("reads only on a role it doesn't know: writes come by name, comment or edit, and nothing else", async () => {
    ask.mockResolvedValue(open("admin"))
    render(<GuestBoardLink token="tok" />)
    await waitFor(() => expect(seen.viewer?.link?.role).toBe("view"))
    expect(seen.viewer?.link?.side).toBeUndefined()
    expect(seen.viewer?.user).toBeUndefined()
    expect(screen.queryByLabelText("Your name, as the team will see it")).toBeNull()
    expect(document.querySelector("[data-link-role]")?.getAttribute("data-link-role")).toBe("view")
    expect(document.querySelector("[data-link-role]")?.textContent).toBe("Can view")
  })

  it("asks a comment link's guest for their name before the board opens, then asks the server as them", async () => {
    ask.mockResolvedValue(open("comment"))
    render(<GuestBoardLink token="tok" />)
    const name = await screen.findByLabelText("Your name, as the team will see it")
    expect(seen.viewer).toBeNull()
    fireEvent.change(name, { target: { value: "Priya" } })
    await act(async () => fireEvent.submit(name.closest("form")!))
    await waitFor(() => expect(seen.viewer?.link?.role).toBe("comment"))
    expect(ask).toHaveBeenLastCalledWith("tok", "Priya", {})
    expect(seen.viewer?.user).toEqual({ id: "guest-g1", name: "Guest: Priya" })
    expect(typeof seen.viewer?.link?.side).toBe("function")
  })

  it("takes a change on reconnect: a new role, a new password's prompt, a link turned off", async () => {
    localStorage.setItem("oc_guest_name_tok", "Priya")
    ask.mockResolvedValue(open("comment"))
    render(<GuestBoardLink token="tok" />)
    await waitFor(() => expect(seen.viewer?.link?.role).toBe("comment"))
    ask.mockResolvedValueOnce(open("edit"))
    await act(async () => expect(await seen.viewer!.tokenFetcher()).toBe(jwt("Guest: Priya")))
    await waitFor(() => expect(seen.viewer?.link?.role).toBe("edit"))
    ask.mockResolvedValueOnce(NEEDS)
    await act(async () => expect(await seen.viewer!.tokenFetcher()).toBe(""))
    expect(await screen.findByText("This link needs its password.")).toBeInTheDocument()
    cleanup()
    seen.viewer = null
    ask.mockResolvedValue(open("view"))
    render(<GuestBoardLink token="tok" />)
    await waitFor(() => expect(seen.viewer).not.toBeNull())
    ask.mockResolvedValueOnce(refused(404, "That link isn't here any more."))
    await act(async () => void (await seen.viewer!.tokenFetcher()))
    expect(await screen.findByText(/The link may have expired or been turned off/)).toBeInTheDocument()
  })
})
