import { getOtherUserId } from "@/lib/utils/getOtherUserId"

/**
 * Pure routing logic for a Workspace Memory item's "where it came from"
 * backlink. Kept framework-free (no React, no hooks) so it's unit-testable
 * and shared by the memory panel and the briefing card.
 *
 * The scope shape mirrors how content is scoped everywhere in the app:
 *   • channel_uuid → a channel (#name); a real per-post capture deep-links
 *     to the post, a scope-keyed worker item links to the channel.
 *   • project_uuid → a project board.
 *   • chat_grp_id  → a conversation. The id shape disambiguates:
 *       – contains a space → 1:1 DM (two sorted user UUIDs, see
 *         helpers.GetGroupingId). Routes to /app/chat/{otherUserId}.
 *       – no space        → group chat (32-char SHA hash, see
 *         helpers.GenerateGroupID). Routes to /app/chat/group/{id}.
 *
 * Returns null when there's no resolvable scope. An empty `href` means
 * "show the label but it isn't a jump target" (e.g. a DM when we don't yet
 * know the current user's id).
 */

export type MemoryScopeKind = "channel" | "project" | "group" | "dm"

export interface MemoryBacklinkInput {
  channel_uuid?: string
  project_uuid?: string
  chat_grp_id?: string
  source_type?: string
  source_uuid?: string
  scope_label?: string
  channel_name?: string
  project_name?: string
}

export interface MemoryBacklink {
  kind: MemoryScopeKind
  label: string
  href: string
}

// isRealContentUUID reports whether a source_uuid is a genuine per-message
// uuid (a >=32-char id with no ":") rather than a scope key like
// "channel_uuid:<uuid>" that the batch worker stores. Only a real content
// uuid can deep-link to a specific post.
function isRealContentUUID(sourceUUID?: string): boolean {
  return !!sourceUUID && sourceUUID.length >= 32 && !sourceUUID.includes(":")
}

export function resolveMemoryBacklink(
  it: MemoryBacklinkInput,
  opts: {
    currentUserId?: string
    channelNameByUUID?: (uuid: string) => string | undefined
    projectNameByUUID?: (uuid: string) => string | undefined
  } = {},
): MemoryBacklink | null {
  // Channel scope.
  if (it.channel_uuid) {
    const name =
      it.channel_name || opts.channelNameByUUID?.(it.channel_uuid) || it.scope_label || "channel"
    const href =
      it.source_type === "post" && isRealContentUUID(it.source_uuid)
        ? `/app/channel/${it.channel_uuid}/${it.source_uuid}`
        : `/app/channel/${it.channel_uuid}`
    return { kind: "channel", label: name, href }
  }

  // Project scope.
  if (it.project_uuid) {
    const name =
      it.project_name || opts.projectNameByUUID?.(it.project_uuid) || it.scope_label || "project"
    return { kind: "project", label: name, href: `/app/project/${it.project_uuid}` }
  }

  // Conversation scope (group chat or 1:1 DM).
  if (it.chat_grp_id) {
    const grp = it.chat_grp_id
    // A manual "save to memory" capture stores the real chat message uuid as
    // its source, so we can deep-link to that exact message (the route
    // supports a /{message-id} segment, like the channel→post case). A
    // worker-extracted item is scope-keyed (no message uuid) → open the
    // conversation at the bottom.
    const msgSeg = it.source_type === "chat" && isRealContentUUID(it.source_uuid) ? `/${it.source_uuid}` : ""
    if (grp.includes(" ")) {
      // 1:1 DM. The route segment is the OTHER participant's uuid.
      if (opts.currentUserId) {
        const other = getOtherUserId(grp, opts.currentUserId)
        if (other) {
          return { kind: "dm", label: it.scope_label || "direct message", href: `/app/chat/${other}${msgSeg}` }
        }
      }
      return { kind: "dm", label: it.scope_label || "direct message", href: "" }
    }
    // Group chat.
    return { kind: "group", label: it.scope_label || "group chat", href: `/app/chat/group/${grp}${msgSeg}` }
  }

  return null
}
