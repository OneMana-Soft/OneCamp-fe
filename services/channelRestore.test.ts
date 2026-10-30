import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

import axiosInstance from "@/lib/axiosInstance"
import { bindAppMutate } from "@/lib/swrMutate"
import { restoreChannel } from "@/services/channelService"
import { GetEndpointUrl } from "@/services/endPoints"
import { ChatPost } from "@/services/endpoints/chat"

// The sidebar is read once and kept, so a channel restored from the Archived
// tab stayed out of it until the next reload (SN-BUG-9). Restoring asks for
// it again: the server lists the channel for a member, and not for a
// workspace admin from outside the channel.

const post = axiosInstance.post as unknown as ReturnType<typeof vi.fn>
const mutate = vi.fn(async () => undefined)

beforeEach(() => {
  post.mockReset()
  mutate.mockClear()
  bindAppMutate(mutate as never, new Map() as never)
})

afterEach(() => bindAppMutate(null))

describe("restoring a channel", () => {
  it("asks the server, then for the sidebar again", async () => {
    post.mockResolvedValue({ data: {} })
    await restoreChannel("c1")
    // Each place that restores says a refusal itself, once (QA F-36).
    expect(post).toHaveBeenCalledWith(ChatPost.RestoreChannel, { channel_uuid: "c1" }, { suppressErrorToast: true })
    expect(mutate).toHaveBeenCalledWith(GetEndpointUrl.SelfProfileSideNav)
  })

  it("leaves the sidebar alone when the server refuses", async () => {
    post.mockRejectedValue(new Error("Request failed with status code 403"))
    await expect(restoreChannel("c1")).rejects.toThrow()
    expect(mutate).not.toHaveBeenCalled()
  })
})
