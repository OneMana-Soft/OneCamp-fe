"use client";

import * as React from "react";
import { useUserAvatar } from "@/hooks/useUserAvatar";
import { getNameInitials } from "@/lib/utils/getNameInitials";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/helpers/cn";
import { relayedAuthorOf, relayInitials } from "@/lib/relayedAuthor";

/**
 * ThreadParticipants — a small avatar facepile of the people who replied in a
 * thread, shown next to the "N replies" badge (Slack-parity polish).
 *
 * Participants are derived from the reply authors already present in the
 * message's comment list — no extra fetch. Deduped by uuid, capped, with a
 * "+N" overflow chip. Avatars are intentionally small to sit inline.
 */

export interface ThreadParticipant {
    uuid: string;
    name: string;
    profileKey?: string;
    /** A guest or Slack person, not a member: neutral initials, no image. */
    relayed?: boolean;
}

/**
 * The people who replied, from a thread's replies. A reply the Guests or
 * Slack bot posted is its person's (see lib/relayedAuthor), so two guests are
 * two faces and neither is the bot's. kinds is every bot's kind by uuid
 * (useBotKindMap); while it loads, replies read as their posters. Pure.
 */
export function replyParticipants(
    comments: { comment_by?: { user_uuid?: string; user_name?: string; user_profile_object_key?: string; is_bot?: boolean }; comment_text?: string }[],
    kinds: Record<string, string> | undefined,
): ThreadParticipant[] {
    return comments.map((c) => {
        const by = c.comment_by;
        const relayed = by?.is_bot && by.user_uuid ? relayedAuthorOf(kinds?.[by.user_uuid], c.comment_text) : null;
        if (relayed) {
            return { uuid: `${by?.user_uuid}:${relayed.kind}:${relayed.name}`, name: relayed.name, relayed: true };
        }
        return { uuid: by?.user_uuid || "", name: by?.user_name || "", profileKey: by?.user_profile_object_key };
    });
}

interface Props {
    participants: ThreadParticipant[];
    maxShown?: number;
    className?: string;
}

function ParticipantAvatar({ p }: { p: ThreadParticipant }) {
    const { src } = useUserAvatar(p.relayed ? undefined : p.profileKey);
    return (
        <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
                <div className="relative flex items-center justify-center rounded-[5px] overflow-hidden size-5 border border-background bg-muted text-3xs font-semibold text-muted-foreground">
                    {src ? (
                        <img
                            src={src}
                            alt={p.name}
                            className="size-full object-cover"
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                            }}
                        />
                    ) : (
                        p.relayed ? relayInitials(p.name) : getNameInitials(p.name || "?")
                    )}
                </div>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6} className="px-2 py-0.5 text-2xs font-medium">
                {p.name}
            </TooltipContent>
        </Tooltip>
    );
}

export function ThreadParticipants({ participants, maxShown = 3, className }: Props) {
    const unique = React.useMemo(() => {
        const seen = new Set<string>();
        const out: ThreadParticipant[] = [];
        for (const p of participants) {
            if (!p || !p.uuid || seen.has(p.uuid)) continue;
            seen.add(p.uuid);
            out.push(p);
        }
        return out;
    }, [participants]);

    if (unique.length === 0) return null;

    const shown = unique.slice(0, maxShown);
    const remaining = unique.length - shown.length;

    return (
        <div className={cn("flex items-center -space-x-1", className)}>
            {shown.map((p) => (
                <ParticipantAvatar key={p.uuid} p={p} />
            ))}
            {remaining > 0 && (
                <div className="flex items-center justify-center rounded-[5px] size-5 border border-background bg-muted text-3xs font-medium text-muted-foreground">
                    +{remaining}
                </div>
            )}
        </div>
    );
}
