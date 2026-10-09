import { afterEach, describe, expect, it, vi } from "vitest"

const { post } = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock("@/lib/axiosInstance", () => ({ default: { post }, OWN_ERRORS: { suppressErrorToast: true } }))

import { invite, resendInvitation } from "./invitationService"
import { PostEndpointUrl } from "@/services/endPoints"

afterEach(() => post.mockReset())

describe("inviting through the service", () => {
  it("sends the address lowercased, to the admin or the member route, and keeps its own errors", async () => {
    post.mockResolvedValue({ data: { invite_link: "https://t/signup?token=x", email_sent: true } })
    const outcome = await invite(" Ana@Example.com ", true)
    expect(post).toHaveBeenCalledWith(PostEndpointUrl.AddInvitation, { email: "ana@example.com" }, { suppressErrorToast: true })
    expect(outcome).toEqual({ ok: true, answer: { invite_link: "https://t/signup?token=x", email_sent: true } })
    await invite("ana@example.com", false)
    expect(post).toHaveBeenLastCalledWith(PostEndpointUrl.CreateInvitation, { email: "ana@example.com" }, { suppressErrorToast: true })
  })

  it("hands back the server's reason for a refusal, or a plain one", async () => {
    post.mockRejectedValueOnce({ response: { status: 409, data: { msg: "ana@example.com is already a member of this workspace." } } })
    expect(await invite("ana@example.com", true)).toEqual({ ok: false, msg: "ana@example.com is already a member of this workspace." })
    post.mockRejectedValueOnce(new Error("Network Error"))
    expect((await resendInvitation("ana@example.com")) as { msg: string }).toMatchObject({ ok: false, msg: expect.stringMatching(/connection/) })
  })
})
