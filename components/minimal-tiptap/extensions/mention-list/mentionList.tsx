import { MentionOptions } from "@tiptap/extension-mention";
import { forwardRef, lazy, Suspense, useImperativeHandle, useRef } from "react";
import { chipAllowed, suggestionPopup } from "../suggestion-popup";
import { UserProfileDataInterface, UserListInterfaceResp } from "@/types/user";
import axiosInstance from "@/lib/axiosInstance";
import { GetEndpointUrl } from "@/services/endPoints";
import { pickPeople } from "@/lib/personName";
import { mentionCounts } from "@/lib/mentionedOften";
import { mentionPlaceOf } from "@/lib/conversation/mentionPlace";
import type { Editor } from "@tiptap/core";
import type { MentionInDocStorage } from "./mentionInDoc";
import type { BroadcastRow, MentionPick, TeamRow } from "./mentionPick";
import type { MentionProps, MentionRef } from "./mentionListView";




// currentChannelIdFromPath extracts the channel id from the active URL when the
// composer is inside a channel (/app/channel/<id>...). Returns "" elsewhere
// (DMs, group chats, docs, comments), where no channel-scoped agents apply.
function currentChannelIdFromPath(): string {
  if (typeof window === "undefined") return ""
  const m = window.location.pathname.match(/\/channel\/([^/?#]+)/)
  return m?.[1] ?? ""
}

// channelAgentCache memoizes a channel's mention agents briefly so the
// per-keystroke `items` fetch doesn't refetch them on every character.
const channelAgentCache: Record<string, { at: number; agents: UserProfileDataInterface[] }> = {}
const CHANNEL_AGENT_TTL_MS = 20_000

async function fetchChannelMentionAgents(channelId: string): Promise<UserProfileDataInterface[]> {
  const cached = channelAgentCache[channelId]
  if (cached && Date.now() - cached.at < CHANNEL_AGENT_TTL_MS) return cached.agents
  try {
    const res = await axiosInstance.get<UserListInterfaceResp>(`/ch/${channelId}/mention-agents`)
    const agents = res.status === 200 && res.data?.users ? res.data.users : []
    channelAgentCache[channelId] = { at: Date.now(), agents }
    return agents
  } catch {
    return []
  }
}

/** How long the workspace's member list is kept for the "@" picker. */
const MEMBERS_TTL_MS = 60_000

let membersCache: { at: number; list: Promise<UserProfileDataInterface[]> } | null = null

/**
 * The workspace's members, asked for once a minute at most (small-details D3):
 * the picker downloaded the whole list again on every key typed after "@".
 * One request in flight is shared by every key that wants it; a failed one
 * is forgotten, so the next key asks again.
 */
export function workspaceMembers(now: number = Date.now()): Promise<UserProfileDataInterface[]> {
  if (membersCache && now - membersCache.at < MEMBERS_TTL_MS) return membersCache.list
  const list = axiosInstance.get<UserListInterfaceResp>(GetEndpointUrl.GetAllUser).then((res) => {
    if (res.status !== 200 || !res.data) throw new Error("no member list")
    return res.data.users || []
  })
  const entry = { at: now, list }
  membersCache = entry
  list.catch(() => {
    if (membersCache === entry) membersCache = null
  })
  return list
}

/** Forgets the member list (tests). */
export function forgetWorkspaceMembers() {
  membersCache = null
}

/** The rows the "@" list shows at most (D-M9). */
const ROWS = 8

/** Whether name answers what's typed after "@": its start, or a word's start. Pure. */
const answers = (name: string, query: string) => {
  const q = query.trim().toLowerCase().replace(/^@/, "")
  if (!q) return true
  return name.toLowerCase().split(/[\s-]+/).some((w) => w.startsWith(q)) || name.toLowerCase().startsWith(q)
}

/**
 * The "@" list's people in a doc (small-details D2): this doc's own first,
 * then those this person mentions most, the rest as the workspace lists them.
 */
function rankForDoc(people: UserProfileDataInterface[], here: Set<string>, counts: Map<string, number>): UserProfileDataInterface[] {
  const isHere = (u: UserProfileDataInterface) => (here.has(u.user_uuid) ? 1 : 0)
  const count = (u: UserProfileDataInterface) => counts.get(u.user_uuid) ?? 0
  // A stable sort: equals keep the workspace's order.
  return [...people].sort((a, b) => isHere(b) - isHere(a) || count(b) - count(a))
}


/** What the "@" list does in a doc's editor beyond people: dates, the doc's own people first, and who can't open it (mentionInDoc.ts). */
export const inDoc = (editor: Editor) => (editor.storage as { mentionInDoc?: MentionInDocStorage }).mentionInDoc

const loadView = () => import("./mentionListView")
const MentionListView = lazy(() => loadView().then((m) => ({ default: m.MentionList })))
const HELD_KEYS = new Set(["Enter", "Tab", "ArrowUp", "ArrowDown"])

export const mentionSuggestionOptions: MentionOptions["suggestion"] = {

  items: async ({ query, editor }): Promise<MentionPick[]> => {
    void loadView()
    const doc = inDoc(editor)
    // A day the query names first ("tod", "fri", "12/10": D4), with a reminder on it.
    const dates = doc?.dateRows(editor, query) ?? []
    try {
        // Where the composer writes (MC-89): its agents, and the conversation's
        // people, teams and broadcasts (D-M9). A doc's editor has no place.
        const place = doc ? null : mentionPlaceOf(editor)
        const channelId = place ? (place.kind === "channel" ? place.id : "") : currentChannelIdFromPath()
        const [users, channelAgents, known] = await Promise.all([
            workspaceMembers(),
            channelId ? fetchChannelMentionAgents(channelId) : Promise.resolve([] as UserProfileDataInterface[]),
            place ? import("@/lib/conversation/mentionables").then((m) => m.mentionablesOf(place)) : Promise.resolve(null),
        ])

        // Channel-scoped AI agents (chip-mentionable only where they're added)
        // are surfaced ahead of the global list; dedupe by user_uuid so an agent
        // that also appears globally isn't listed twice.
        const seen = new Set<string>()
        const merged: UserProfileDataInterface[] = []
        for (const u of [...channelAgents, ...users]) {
            if (!u || seen.has(u.user_uuid)) continue
            seen.add(u.user_uuid)
            merged.push(u)
        }

        // In a doc, this doc's people ahead of the rest, then whoever this
        // person mentions most (D2), as good a match being equal (pickPeople
        // keeps the order of equals).
        const ordered = doc ? rankForDoc(merged, doc.peopleHere(editor), mentionCounts()) : merged

        // Display name, full name or @handle, any case, a leading @ allowed.
        if (!place || !known) return [...dates, ...pickPeople(ordered, query, 5)];
        // D-M9: this conversation's people by recent activity, agents, teams,
        // the others ("Not in #launch"), then the broadcasts; you last.
        const { orderPeople } = await import("@/lib/conversation/mentionables")
        const people = orderPeople(pickPeople(ordered, query, ROWS * 2), known)
        const teams: TeamRow[] = (known.teams ?? []).filter((t) => answers(t.name, query)).slice(0, 3).map((team) => ({ team }))
        const broadcasts: BroadcastRow[] = (known.broadcasts ?? [])
            .filter((b) => answers(b.name, query))
            .map((b) => ({ broadcast: b.name, count: b.count, channel: known.name ?? "", why: known.why }))
        const rows: MentionPick[] = [...people.head, ...people.agents, ...teams, ...people.others, ...broadcasts, ...people.mine]
        return [...dates, { place, known, notHere: people.notHere, night: people.night }, ...rows.slice(0, ROWS)];
    } catch (e) {
        console.error("Failed to fetch users for mention", e);
        return dates;
    }
  },

  // "@" in code is code (an email address, a decorator), not a person.
  allow: chipAllowed("mention"),

  // The shared popup (suggestion-popup.ts): Escape closes the picker and
  // only the picker, and a second Escape reaches the page; the list is
  // announced from the editor.
  render: suggestionPopup({
    component: forwardRef<MentionRef, MentionProps>(function MentionMenu(props, ref) {
      // The view loads when the list first opens (items() starts it). Until
      // it has, keys that pick from the list are held, never the text's: an
      // Enter is not a send while there are people to choose from.
      const inner = useRef<MentionRef>(null)
      useImperativeHandle(ref, () => ({
        onKeyDown: (p) => inner.current?.onKeyDown(p) ?? (props.items.length > 0 && HELD_KEYS.has(p.event.key)),
      }), [props.items.length])
      return (
        <Suspense fallback={null}>
          <MentionListView {...props} ref={inner} />
        </Suspense>
      );
    }),
    // "@" alone, with no one to offer yet: nothing shows.
    isEmpty: (props) => props.items.length === 0 && !props.query,
  }),
};

