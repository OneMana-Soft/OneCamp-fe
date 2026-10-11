import { MentionOptions } from "@tiptap/extension-mention";
import { ReactRenderer } from "@tiptap/react";
import { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import tippy, { Instance as TippyInstance } from "tippy.js";
import { UserProfileDataInterface, UserListInterfaceResp } from "@/types/user";
import MentionMember, { MentionAvatar } from "./mentionMember";
import { CommandList, type CommandListHandle, type CommandListItem } from "@/components/ui/CommandList";
import store from "@/store/store";
import { updateMentionOpenedRecently } from "@/store/slice/mentionSlice";
import axiosInstance from "@/lib/axiosInstance";
import { GetEndpointUrl } from "@/services/endPoints";
import { displayNameOf, pickPeople } from "@/lib/personName";
import { useBotKindMap } from "@/hooks/useBotKinds";
import { isAIBot } from "@/lib/botCopy";

type MentionSuggestion = {
  id: string;
  mentionLabel: string;
  label: string
};

const DOM_RECT_FALLBACK: DOMRect = {
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    x: 0,
    y: 0,
    toJSON() {
      return {};
    },
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

export const mentionSuggestionOptions: MentionOptions["suggestion"] = {

  items: async ({ query }): Promise<UserProfileDataInterface[]> => {

    try {
        const channelId = currentChannelIdFromPath()
        const [usersListRes, channelAgents] = await Promise.all([
            axiosInstance.get<UserListInterfaceResp>(GetEndpointUrl.GetAllUser),
            channelId ? fetchChannelMentionAgents(channelId) : Promise.resolve([] as UserProfileDataInterface[]),
        ])

        if(usersListRes.status !== 200 || !usersListRes.data) {
            return []
        }

        const users = usersListRes.data.users || [];

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

        // Display name, full name or @handle, any case, a leading @ allowed.
        return pickPeople(merged, query, 5);
    } catch (e) {
        console.error("Failed to fetch users for mention", e);
        return [];
    }
  },

  render: () => {
    let component: ReactRenderer<MentionRef> | undefined;
    let popup: TippyInstance | undefined;

    return {
      onStart: (props) => {

        component = new ReactRenderer(MentionList, {
          props,
          editor: props.editor,

        });

        popup = tippy("body", {
            getReferenceClientRect: () =>
              props.clientRect?.() ?? DOM_RECT_FALLBACK,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: "manual",
            placement: "bottom-start",
            offset: [0, 6],
            theme: "none",
            arrow: false,
            popperOptions: { modifiers: [{ name: "flip", options: { fallbackPlacements: ["top-start"] } }] },
          })[0];
      },

      onUpdate(props) {
        component?.updateProps(props);

        popup?.setProps({
            getReferenceClientRect: () => props.clientRect?.() || DOM_RECT_FALLBACK,
        });
      },

      onKeyDown(props) {
        if (props.event.key === "Escape") {
          // Escape closes the picker, and only the picker. Once it is closed
          // the key is not this suggestion's any more, so a second press
          // reaches the page (closing the thread it was typed in, say).
          if (!popup?.state.isVisible) return false;
          popup.hide();
          return true;
        }

        if (!component?.ref) {
          return false;
        }

        return component?.ref.onKeyDown(props);
      },

      onExit() {
        popup?.destroy();
        component?.destroy();

        // Remove references to the old popup and component upon destruction/exit.
        popup = undefined;
        component = undefined;
      },
    };
  },
};

type MentionRef = {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
};

interface MentionProps extends SuggestionProps {
  items: UserProfileDataInterface[];
}

/**
 * The @mention picker (content.md D24): the area's CommandList at 320 px,
 * people first and then agents, 36 px rows with the avatar, name and handle,
 * and an empty state instead of nothing.
 */
const MentionList = forwardRef<MentionRef, MentionProps>((props, ref) => {
    const listRef = useRef<CommandListHandle>(null);
    const ordered = useMemo(
        () => [...props.items.filter((p) => !p.is_bot), ...props.items.filter((p) => p.is_bot)],
        [props.items],
    );

    const selectItem = (person: UserProfileDataInterface | undefined) => {
        if (!person) return;
        const mentionItem: MentionSuggestion = {
            id: `${person.user_uuid}@${person.uid}`,
            mentionLabel: displayNameOf(person),
            label: displayNameOf(person)
        };
        props.command(mentionItem);
        store.dispatch(updateMentionOpenedRecently({openedRecently: true}))
    };

    const botKinds = useBotKindMap();
    const items: CommandListItem[] = useMemo(
        () =>
            ordered.map((person) => ({
                id: person.user_uuid,
                text: displayNameOf(person),
                label: <MentionMember person={person} />,
                group: person.is_bot ? "Agents" : "People",
                tile: <MentionAvatar person={person} />,
                // An agent says what asking it means (chat C41): it acts
                // for whoever asks, with what they may do. No owner is
                // named: the people list doesn't carry an agent's sponsor.
                meta: person.is_bot && isAIBot(botKinds?.[person.user_uuid] ?? person.user_bot_kind) ? "Agent · acts for you" : undefined,
            })),
        [ordered, botKinds],
    );

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }: SuggestionKeyDownProps) => listRef.current?.onKeyDown(event) ?? false,
    }));

    if (!items.length && !props.query) return null;
    return (
        <div data-mention-list="">
            <CommandList
                ref={listRef}
                label="Mention someone"
                className="w-80"
                roomy
                maxHeight={8 * 36 + 32}
                items={items}
                onSelect={(item) => selectItem(ordered.find((p) => p.user_uuid === item.id))}
                empty={<span className="text-ink-3">No one called “{props.query}” here</span>}
            />
        </div>
    );
});
