import { MentionOptions } from "@tiptap/extension-mention";
import type { Editor } from "@tiptap/core";
import { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { chipAllowed, suggestionPopup, type SuggestionListExtras } from "../suggestion-popup";
import { UserProfileDataInterface, UserListInterfaceResp } from "@/types/user";
import MentionMember, { MentionAvatar } from "./mentionMember";
import { CommandList, CommandTile, type CommandListHandle, type CommandListItem } from "@/components/ui/CommandList";
import store from "@/store/store";
import { updateMentionOpenedRecently } from "@/store/slice/mentionSlice";
import axiosInstance from "@/lib/axiosInstance";
import { GetEndpointUrl } from "@/services/endPoints";
import { displayNameOf, pickPeople } from "@/lib/personName";
import { useBotKindMap } from "@/hooks/useBotKinds";
import { isAIBot } from "@/lib/botCopy";
import { Bell, Calendar } from "@/lib/icons";
import { useLaterActions } from "@/hooks/useLater";
import { useDebounce } from "@/hooks/useDebounce";
import { countMention, mentionCounts } from "@/lib/mentionedOften";
import type { MentionAccess } from "@/services/connectedService";
import type { DateRow, MentionInDocStorage } from "./mentionInDoc";

type MentionSuggestion = {
  id: string;
  mentionLabel: string;
  label: string
};


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
export const MEMBERS_TTL_MS = 60_000

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

type MentionPick = UserProfileDataInterface | DateRow
const isDate = (p: MentionPick): p is DateRow => "offer" in p

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
const inDoc = (editor: Editor) => (editor.storage as { mentionInDoc?: MentionInDocStorage }).mentionInDoc

export const mentionSuggestionOptions: MentionOptions["suggestion"] = {

  items: async ({ query, editor }): Promise<MentionPick[]> => {
    const doc = inDoc(editor)
    // A day the query names first ("tod", "fri", "12/10": D4), with a reminder on it.
    const dates = doc?.dateRows(editor, query) ?? []
    try {
        const channelId = currentChannelIdFromPath()
        const [users, channelAgents] = await Promise.all([
            workspaceMembers(),
            channelId ? fetchChannelMentionAgents(channelId) : Promise.resolve([] as UserProfileDataInterface[]),
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
        return [...dates, ...pickPeople(ordered, query, 5)];
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
      return <MentionList {...props} ref={ref} />;
    }),
    // "@" alone, with no one to offer yet: nothing shows.
    isEmpty: (props) => props.items.length === 0 && !props.query,
  }),
};

type MentionRef = {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
};

interface MentionProps extends SuggestionProps, SuggestionListExtras {
  items: MentionPick[];
}

/**
 * Who of the people the list offers can't open the doc being written, and
 * whether the writer may share it with them; only in a doc. A check that
 * fails marks nobody: whoever is mentioned without access is still found
 * out at the save, and the writer asked to share (business/Follow).
 */
function useMentionAccess(editor: Editor, people: UserProfileDataInterface[]): MentionAccess | null {
    const doc = inDoc(editor)
    const ids = people.filter((p) => !p.is_bot).map((p) => p.user_uuid).slice(0, 10)
    // Asked of the list as it settles, not at every key typed.
    const key = useDebounce(doc ? ids.join(",") : "", 150)
    const [answer, setAnswer] = useState<MentionAccess | null>(null)
    useEffect(() => {
        const asking = key ? doc : undefined
        if (!asking) return setAnswer(null)
        let live = true
        asking.access(editor, key.split(","))?.then((access) => live && setAnswer(access), () => undefined)
        return () => {
            live = false
        }
    }, [key, doc, editor])
    return answer
}

/**
 * The @mention picker (content.md D24): the area's CommandList at 320 px.
 * A day the query names comes first, with "Remind me" (D4, D6); then people,
 * in a doc its own first and then those the writer mentions most (D2), then
 * agents, 36 px rows with the avatar, name and
 * handle, and an empty state instead of nothing. In a doc, someone who can't
 * open it says so, and picking them shares it with them as well, for a writer
 * who may share it ("Share and mention").
 */
const MentionList = forwardRef<MentionRef, MentionProps>((props, ref) => {
    const listRef = useRef<CommandListHandle>(null);
    const dates = useMemo(() => props.items.filter(isDate), [props.items]);
    const people = useMemo(() => props.items.filter((p): p is UserProfileDataInterface => !isDate(p)), [props.items]);
    const ordered = useMemo(
        () => [...people.filter((p) => !p.is_bot), ...people.filter((p) => p.is_bot)],
        [people],
    );
    const access = useMentionAccess(props.editor, ordered);
    const { save } = useLaterActions();

    const selectItem = (person: UserProfileDataInterface | undefined) => {
        if (!person) return;
        const mentionItem: MentionSuggestion = {
            id: `${person.user_uuid}@${person.uid}`,
            mentionLabel: displayNameOf(person),
            label: displayNameOf(person)
        };
        props.command(mentionItem);
        countMention(person.user_uuid);
        store.dispatch(updateMentionOpenedRecently({openedRecently: true}))
        if (access?.can_share && access.cant_open.includes(person.user_uuid)) inDoc(props.editor)?.share(props.editor, person)
    };

    const selectDate = (row: DateRow) => inDoc(props.editor)?.insertDate(props.editor, props.range, row, save);

    const botKinds = useBotKindMap();
    const items: CommandListItem[] = useMemo(
        () => [
            ...dates.map((row) => ({
                id: `${row.kind}:${row.offer.date}`,
                label: row.kind === "remind" ? "Remind me" : row.offer.label,
                group: "Dates",
                tile: <CommandTile>{row.kind === "remind" ? <Bell /> : <Calendar />}</CommandTile>,
                meta: row.kind === "remind" ? row.offer.remind : row.offer.detail,
            })),
            ...ordered.map((person) => {
                const shut = !person.is_bot && !!access?.cant_open.includes(person.user_uuid)
                return {
                    id: person.user_uuid,
                    text: displayNameOf(person),
                    label: <MentionMember person={person} />,
                    group: person.is_bot ? "Agents" : "People",
                    tile: <MentionAvatar person={person} />,
                    // An agent says what asking it means (chat C41): it acts
                    // for whoever asks, with what they may do. No owner is
                    // named: the people list doesn't carry an agent's sponsor.
                    // Someone who can't open the doc says so (never an agent).
                    meta: person.is_bot && isAIBot(botKinds?.[person.user_uuid] ?? person.user_bot_kind) ? "Agent · acts for you" : shut ? "Can't open this doc" : undefined,
                    trailing: shut && access?.can_share ? <span className="shrink-0 text-meta font-[510] text-brand-text">Share and mention</span> : undefined,
                }
            }),
        ],
        [dates, ordered, botKinds, access],
    );

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }: SuggestionKeyDownProps) => listRef.current?.onKeyDown(event) ?? false,
    }));

    if (!items.length && !props.query) return null;
    return (
        <div data-mention-list="">
            <CommandList
                ref={listRef}
                comboboxFor={props.comboboxFor}
                label={inDoc(props.editor) ? "Mention someone or a date" : "Mention someone"}
                className="w-80"
                roomy
                maxHeight={8 * 36 + 32}
                items={items}
                onSelect={(item) => {
                    const date = dates.find((d) => `${d.kind}:${d.offer.date}` === item.id)
                    if (date) selectDate(date)
                    else selectItem(ordered.find((p) => p.user_uuid === item.id))
                }}
                empty={<span className="text-ink-3">No one called “{props.query}” here</span>}
            />
        </div>
    );
});
