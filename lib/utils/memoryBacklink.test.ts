import { describe, expect, it } from "vitest"
import { resolveMemoryBacklink } from "@/lib/utils/memoryBacklink"

// Two sorted user UUIDs joined by a space — the canonical 1:1 DM grouping id
// (helpers.GetGroupingId). The current user is "userA".
const DM_GRP = "userA userB"
// A 32-char hex hash — the canonical group-chat id (helpers.GenerateGroupID).
const GROUP_GRP = "0123456789abcdef0123456789abcdef"

describe("resolveMemoryBacklink", () => {
  it("returns null when there is no resolvable scope", () => {
    expect(resolveMemoryBacklink({})).toBeNull()
  })

  describe("channel", () => {
    it("links to the channel and prefers the server-resolved name", () => {
      const r = resolveMemoryBacklink({ channel_uuid: "ch1", channel_name: "design" })
      expect(r).toEqual({ kind: "channel", label: "design", href: "/app/channel/ch1" })
    })

    it("deep-links to the post for a real per-post capture", () => {
      const r = resolveMemoryBacklink({
        channel_uuid: "ch1",
        source_type: "post",
        source_uuid: "00000000000000000000000000000000post", // >=32, no ':'
      })
      expect(r?.href).toBe("/app/channel/ch1/00000000000000000000000000000000post")
    })

    it("does NOT deep-link a scope-keyed worker source (contains ':')", () => {
      const r = resolveMemoryBacklink({
        channel_uuid: "ch1",
        source_type: "post",
        source_uuid: "channel_uuid:ch1",
      })
      expect(r?.href).toBe("/app/channel/ch1")
    })

    it("falls back to the sidebar name, then a generic label", () => {
      expect(
        resolveMemoryBacklink({ channel_uuid: "ch1" }, { channelNameByUUID: () => "ops" })?.label,
      ).toBe("ops")
      expect(resolveMemoryBacklink({ channel_uuid: "ch1" })?.label).toBe("channel")
    })
  })

  describe("project", () => {
    it("links to the project board with the resolved name", () => {
      const r = resolveMemoryBacklink({ project_uuid: "pr1", project_name: "Q3 Launch" })
      expect(r).toEqual({ kind: "project", label: "Q3 Launch", href: "/app/project/pr1" })
    })
  })

  describe("group chat", () => {
    it("links to the group conversation", () => {
      const r = resolveMemoryBacklink({ chat_grp_id: GROUP_GRP, scope_label: "Alice, Bob" })
      expect(r).toEqual({ kind: "group", label: "Alice, Bob", href: `/app/chat/group/${GROUP_GRP}` })
    })

    it("deep-links to the message for a real per-message capture", () => {
      const r = resolveMemoryBacklink({
        chat_grp_id: GROUP_GRP,
        source_type: "chat",
        source_uuid: "00000000000000000000000000000msg1", // >=32, no ':'
      })
      expect(r?.href).toBe(`/app/chat/group/${GROUP_GRP}/00000000000000000000000000000msg1`)
    })

    it("does NOT append a message id for a scope-keyed worker source", () => {
      const r = resolveMemoryBacklink({
        chat_grp_id: GROUP_GRP,
        source_type: "chat",
        source_uuid: "chat_grp_id:" + GROUP_GRP,
      })
      expect(r?.href).toBe(`/app/chat/group/${GROUP_GRP}`)
    })

    it("uses a generic label when none is resolved", () => {
      expect(resolveMemoryBacklink({ chat_grp_id: GROUP_GRP })?.label).toBe("group chat")
    })
  })

  describe("1:1 DM", () => {
    it("links to the OTHER participant's chat when the current user is known", () => {
      const r = resolveMemoryBacklink({ chat_grp_id: DM_GRP, scope_label: "Bob" }, { currentUserId: "userA" })
      expect(r).toEqual({ kind: "dm", label: "Bob", href: "/app/chat/userB" })
    })

    it("deep-links to the message for a real per-message capture", () => {
      const r = resolveMemoryBacklink(
        { chat_grp_id: DM_GRP, source_type: "chat", source_uuid: "00000000000000000000000000000msg2" },
        { currentUserId: "userA" },
      )
      expect(r?.href).toBe("/app/chat/userB/00000000000000000000000000000msg2")
    })

    it("resolves the peer regardless of which side the current user is on", () => {
      expect(resolveMemoryBacklink({ chat_grp_id: DM_GRP }, { currentUserId: "userB" })?.href).toBe(
        "/app/chat/userA",
      )
    })

    it("renders a label without a link when the current user is unknown", () => {
      const r = resolveMemoryBacklink({ chat_grp_id: DM_GRP })
      expect(r?.kind).toBe("dm")
      expect(r?.href).toBe("")
    })
  })

  describe("scope precedence", () => {
    it("prefers channel over project over chat when several are set", () => {
      const r = resolveMemoryBacklink(
        { channel_uuid: "ch1", project_uuid: "pr1", chat_grp_id: GROUP_GRP },
        {},
      )
      expect(r?.kind).toBe("channel")
    })
  })
})
