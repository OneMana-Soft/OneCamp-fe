import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/axiosInstance", () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

import axiosInstance from "@/lib/axiosInstance"
import { createGuestLink } from "@/services/guestService"

const post = axiosInstance.post as unknown as ReturnType<typeof vi.fn>

const payloadOf = () => post.mock.calls[0][1]

beforeEach(() => {
  post.mockReset()
  post.mockResolvedValue({ data: { data: {} } })
})

describe("guest link expiry", () => {
  // A permanent link is its own flag on the wire. ttl_hours 0 already means
  // "use the server default", so if permanence ever travelled as a duration a
  // caller who simply omitted the ttl would get a link that never dies.
  it("sends permanence as a flag and never as a duration", async () => {
    await createGuestLink("doc", "doc-1", undefined, "view", true)

    const body = payloadOf()
    expect(body.never_expires).toBe(true)
    expect(body.ttl_hours).toBe(0)
  })

  // The default has to stay expiring. Anyone who does not ask for a permanent
  // link must not get one.
  it("does not ask for permanence unless told to", async () => {
    await createGuestLink("doc", "doc-1", 24 * 14, "view")

    const body = payloadOf()
    expect(body.never_expires).toBe(false)
    expect(body.ttl_hours).toBe(24 * 14)
  })

  // The UI's "does not expire" sentinel is negative. It must be translated, not
  // forwarded: a negative ttl reaching the server would be read as "default".
  it("never forwards a negative ttl", async () => {
    await createGuestLink("doc", "doc-1", undefined, "view", true)

    expect(payloadOf().ttl_hours).toBeGreaterThanOrEqual(0)
  })
})
