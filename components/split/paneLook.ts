import useSWR from "swr"
import { useSelector } from "react-redux"
import type { RootState } from "@/store/store"
import { userDisplayName } from "@/lib/utils/userDisplayName"
import { cachedData } from "@/lib/swrMutate"
import { docInfoKey } from "@/lib/docCache"
import { GetEndpointUrl } from "@/services/endPoints"
import { CheckSquare, FileText, FolderKanban, Hash, MessageSquare, PanelTop, Users, Video } from "@/lib/icons"
import { MAIN_KEY, paneKey, type Pane, type PaneKind } from "@/lib/split"

/** What a view is, for its bar, its chip when tucked, and its ghost while it moves. */
export const KIND: Record<PaneKind, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  channel: { label: "Channel", icon: Hash },
  chat: { label: "Chat", icon: MessageSquare },
  group: { label: "Group chat", icon: Users },
  doc: { label: "Doc", icon: FileText },
  project: { label: "Project", icon: FolderKanban },
  task: { label: "Task", icon: CheckSquare },
  "call-channel": { label: "Call", icon: Video },
  "call-chat": { label: "Call", icon: Video },
  "call-group": { label: "Call", icon: Video },
}

/** The parts of the store a pane's name comes from. */
type NameSources = {
  users: Pick<RootState["users"], "userSidebar">
  recentItems?: { items?: { id: string; title: string }[] }
}

/**
 * Where a doc's or a task's own view keeps its answer, and its name in it.
 * One beside the page that wasn't a recent visit was called "Doc" in its bar,
 * its region, its chip and its toasts: the sidebar holds neither for sure.
 */
type Answer = { data?: { doc_title?: string; task_name?: string } } | undefined
const OWN: Partial<Record<PaneKind, { key: (id: string) => string; name: (a: Answer) => string | undefined }>> = {
  // Untitled, as the doc's own page and every list of docs say it.
  doc: { key: docInfoKey, name: (a) => a?.data && (a.data.doc_title?.trim() || "Untitled") },
  task: { key: (id) => `${GetEndpointUrl.GetTaskInfo}/${id}`, name: (a) => a?.data?.task_name?.trim() },
}

/** The cache key a pane's own view loads its name into; null for a kind the store names. */
export const ownKey = (pane: Pane | null | undefined) => (pane && OWN[pane.kind]?.key(pane.id)) || null

/**
 * What a pane's bar calls it: its own name where the app knows it, or null
 * for its kind. For a doc or a task, what its own view loaded (`answer`, else
 * the cache's); then the sidebar's channels, conversations, projects and
 * docs; then a recent visit. The bar said "Channel" over a channel whose name
 * was the next thing down.
 */
export function paneTitle(s: NameSources, pane: Pane, answer?: unknown): string | null {
  const key = ownKey(pane)
  const own = key && OWN[pane.kind]?.name((answer ?? cachedData(key)) as Answer)
  if (own) return own
  const sb = s.users.userSidebar
  switch (pane.kind) {
    case "channel":
    case "call-channel": {
      const c = [...(sb.userChannels || []), ...(sb.userFavChannels || [])].find((c) => c?.ch_uuid === pane.id)
      if (c?.ch_name) return c.ch_name
      break
    }
    case "project": {
      const p = (sb.userProjects || []).find((p) => p?.project_uuid === pane.id)
      if (p?.project_name) return p.project_name
      break
    }
    case "chat": {
      for (const d of sb.userChats || []) {
        const who = d?.dm_participants?.find((u) => u?.user_uuid === pane.id)
        if (who) return userDisplayName(who) || null
      }
      break
    }
    case "group": {
      const d = (sb.userChats || []).find((d) => d?.dm_grouping_id === pane.id)
      if (d) return d.dm_name || d.dm_participants.map((u) => userDisplayName(u)).filter(Boolean).join(", ") || null
      break
    }
    case "doc": {
      // Until its view has loaded it: one tucked away as the page loaded.
      const t = (sb.userDocs || []).find((d) => d?.doc_uuid === pane.id)?.doc_title || (sb.userStarred || []).find((p) => p?.resource_uuid === pane.id)?.title
      if (t?.trim()) return t.trim()
      break
    }
  }
  return s.recentItems?.items?.find((i) => i.id === pane.id)?.title || null
}

/** The pane a view's key stands for: a side view's, or the page's own item (null where the page isn't one). */
const paneAt = (split: { panes: Pane[]; here: Pane | null }, key: string) => (key === MAIN_KEY ? split.here : (split.panes.find((x) => paneKey(x) === key) ?? null))

/** A view's name and icon by its key: a pane's, or the page's ("This page" where it isn't a place). */
export function viewLook(s: NameSources, split: { panes: Pane[]; here: Pane | null }, key: string, pane?: Pane) {
  const p = pane ?? paneAt(split, key)
  if (!p) return { name: "This page", icon: PanelTop }
  return { name: paneTitle(s, p) ?? KIND[p.kind].label, icon: KIND[p.kind].icon }
}

/**
 * viewLook for what stays on screen (a pane's bar and region, a handle, a
 * chip), followed as the store and the view's own answer change: a doc's
 * title arriving, or a rename.
 */
export function useViewLook(key: string, pane?: Pane) {
  const p = useSelector((s: RootState) => pane ?? (s.split ? paneAt(s.split, key) : null))
  const answer = useSWR(ownKey(p), null).data
  const name = useSelector((s: RootState) => (p ? paneTitle(s, p, answer) : null))
  return p ? { name: name ?? KIND[p.kind].label, icon: KIND[p.kind].icon } : { name: "This page", icon: PanelTop }
}
