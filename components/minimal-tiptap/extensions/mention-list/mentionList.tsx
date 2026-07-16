import { MentionOptions } from "@tiptap/extension-mention";
import { ReactRenderer } from "@tiptap/react";
import { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import tippy, { Instance as TippyInstance } from "tippy.js";
import { UserProfileDataInterface, UserListInterfaceResp } from "@/types/user";
import MentionMember from "./mentionMember";
import store from "@/store/store";
import { updateMentionOpenedRecently } from "@/store/slice/mentionSlice";
import axiosInstance from "@/lib/axiosInstance";
import { GetEndpointUrl } from "@/services/endPoints";

export type MentionSuggestion = {
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

        return merged.filter((user) =>
            user.user_name.toLowerCase().startsWith(query.toLowerCase())
        ).slice(0, 5);
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
          popup?.hide();
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

const MentionList = forwardRef<MentionRef, MentionProps>((props, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const selectItem = (index: number) => {
        if (index >= props.items.length) {
            return;
        }

        const suggestion = props.items[index];
        const mentionItem: MentionSuggestion = {
            id: `${suggestion.user_uuid}@${suggestion.uid}`,
            mentionLabel: suggestion.user_name,
            label: suggestion.user_name
        };
        props.command(mentionItem);
    };

    const upHandler = () => {
        setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
    };

    const downHandler = () => {
        setSelectedIndex((selectedIndex + 1) % props.items.length);
    };

    const enterHandler = () => {
        selectItem(selectedIndex);
        store.dispatch(updateMentionOpenedRecently({openedRecently: true}))
    };

    useEffect(() => {
        setSelectedIndex(0);
    }, [props.items]);

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }: SuggestionKeyDownProps) => {
            if (event.key === "ArrowUp") {
                upHandler();
                return true;
            }

            if (event.key === "ArrowDown") {
                downHandler();
                return true;
            }

            if (event.key === "Enter") {
                enterHandler();
                return true;
            }

            return false;
        },
    }));


    return props.items.length > 0 ? (
        <div className="flex flex-col overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md min-w-[12rem] p-1 gap-0.5">
            {props.items.map((item, index) => (
                <MentionMember
                    key={index}
                    ind={index}
                    person={item}
                    selectItem={selectItem}
                    selectedIndex={selectedIndex}
                />
            ))}
        </div>
    ) : null;
});

MentionList.displayName = "MentionList";
export default MentionList;