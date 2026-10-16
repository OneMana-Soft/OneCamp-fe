import { NodeViewWrapper, NodeViewProps } from "@tiptap/react";
import React, { useMemo } from "react";
import { useDispatch } from "react-redux";
import { openUI } from "@/store/slice/uiSlice";
import { useProfileHover } from "@/hooks/useProfileHover";
import { cn } from "@/lib/utils/helpers/cn";
import { Spark } from "@/components/ui/graphics/motifs";
import { agentIdsOf, mentionHue, mentionKind, mentionUserId } from "@/components/message/tintMentions";
import { useFetchOnlyOnce } from "@/hooks/useFetch";
import { useBotKindMap } from "@/hooks/useBotKinds";
import { GetEndpointUrl } from "@/services/endPoints";
import type { UserProfileInterface } from "@/types/user";
import { useGuestReader } from "@/components/minimal-tiptap/guestReader";

/**
 * A mention in the editor and the composer, drawn as the static renderer
 * draws it (tintMentions + the chip rules in minimal-tiptap/styles/index.css):
 * a neutral chip with the person's hue as a dot, brand-muted when it is you,
 * and the agent tint with the spark for the "@" when it is an agent. Resting
 * on it opens the person's card (hub P1).
 */
const MentionNodeView: React.FC<NodeViewProps> = (props) => {
  const dispatch = useDispatch();
  const { id, label } = props.node.attrs;
  // A guest outside the workspace has no session: nothing is asked of the API
  // for them (a 401 signs the browser out), and a name is just a name.
  const guest = useGuestReader();
  // The profile and the bot kinds are fetched once for the whole app (SWR),
  // not per mention.
  const self = useFetchOnlyOnce<UserProfileInterface>(guest ? "" : GetEndpointUrl.SelfProfile);
  const botKinds = useBotKindMap(!guest);
  const agentIds = useMemo(() => agentIdsOf(botKinds), [botKinds]);
  const kind = mentionKind(id, { me: self.data?.data?.user_uuid, agentIds });
  const hover = useProfileHover(guest ? null : mentionUserId(id));

  const open = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const userUUID = mentionUserId(id);
    if (userUUID) dispatch(openUI({ key: 'otherUserProfile', data: { userUUID } }));
  };

  if (guest) {
    return (
      <NodeViewWrapper as="span" className="inline">
        <span
          className={cn("chat-mention", `mention-${kind}`)}
          data-id={id}
          data-label={label}
          data-type="mention"
          data-hue={kind === "person" ? mentionHue(label) : undefined}
        >
          {kind === "agent" ? <Spark className="mention-spark" /> : "@"}{label}
        </span>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper as="span" className="inline">
      <span
        role="button"
        tabIndex={0}
        onClick={open}
        {...hover}
        onKeyDown={(e) => { if (e.key === "Enter") open(e) }}
        className={cn("chat-mention", `mention-${kind}`, props.selected && "ring-2 ring-brand ring-offset-1 ring-offset-sheet")}
        data-id={id}
        data-label={label}
        data-type="mention"
        data-hue={kind === "person" ? mentionHue(label) : undefined}
      >
        {kind === "agent" ? <Spark className="mention-spark" /> : "@"}{label}
      </span>
    </NodeViewWrapper>
  );
};

export default MentionNodeView;
