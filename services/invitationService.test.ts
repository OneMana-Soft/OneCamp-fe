import { afterEach, describe, expect, it, vi } from "vitest"

const { post } = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock("@/lib/axiosInstance", () => ({ default: { post }, OWN_ERRORS: { suppressErrorToast: true } }))

import { invite, resendInvitation } from "./invitationService"
import { PostEndpointUrl } from "@/services/endPoints"
import { AdminPost } from "@/services/endpoints/admin"

afterEach(() => post.mockReset())

describe("inviting through the service", () => {
  it("sends the address lowercased, to the admin or the member route, and keeps its own errors", async () => {
    post.mockResolvedValue({ data: { invite_link: "https://t/signup?token=x", email_sent: true } })
    const outcome = await invite(" Ana@Example.com ", true)
    expect(post).toHaveBeenCalledWith(PostEndpointUrl.AddInvitation, { email: "ana@example.com" }, { suppressErrorToast: true })
    expect(outcome).toEqual({ ok: true, answer: { invite_link: "https://t/signup?token=x", email_sent: true } })
    await invite("ana@example.com", false)
    expect(post).toHaveBeenLastCalledWith(AdminPost.CreateInvitation, { email: "ana@example.com" }, { suppressErrorToast: true })
  })

  it("hands back the server's reason for a refusal, or a plain one", async () => {
    post.mockRejectedValueOnce({ response: { status: 409, data: { msg: "ana@example.com is already a member of this workspace." } } })
    expect(await invite("ana@example.com", true)).toEqual({ ok: false, msg: "ana@example.com is already a member of this workspace." })
    post.mockRejectedValueOnce(new Error("Network Error"))
    expect((await resendInvitation("ana@example.com")) as { msg: string }).toMatchObject({ ok: false, msg: expect.stringMatching(/connection/) })
  })

  // QA SH-02: a member who may not invite got "Check your connection and try
  // again" for the server's empty 403.
  it("says a refusal is about permission, and a server fault without blaming the connection", async () => {
    post.mockRejectedValueOnce({ response: { status: 403, data: {} }, message: "Request failed with status code 403" })
    expect(await invite("ana@example.com", false)).toEqual({ ok: false, msg: "You don't have permission to do that." })
    post.mockRejectedValueOnce({ response: { status: 500, data: { msg: "Failed to create invitation" } } })
    expect(await invite("ana@example.com", false)).toEqual({ ok: false, msg: "Couldn't send the invitation. Try again in a moment." })
  })
})

// QA SH-02 (14 Oct 2026): a refused invitation read "Couldn't send the
// invitation. Check your connection and try again.", which blamed the network
// for a permission.
describe("an invitation that is refused", () => {
  it("says the server's own reason, the capability's refusal included", async () => {
    post.mockRejectedValueOnce({ response: { status: 403, data: { code: "capability_required", capability: "invitation.create", msg: "Only admins, or people an admin allows, can invite people. Ask an admin." } } })
    expect(await invite("ana@example.com", false)).toEqual({ ok: false, msg: "Only admins, or people an admin allows, can invite people. Ask an admin." })
  })

  it("says it is a permission when the server gives no reason, never the connection", async () => {
    post.mockRejectedValueOnce({ response: { status: 403, data: {} }, message: "Request failed with status code 403" })
    expect(await invite("ana@example.com", false)).toEqual({ ok: false, msg: "You don't have permission to do that." })
  })
})
