"use client";

import { displayNameOf } from "@/lib/personName"
import * as React from "react";
import { useUserAvatar } from "@/hooks/useUserAvatar";
import { getNameInitials } from "@/lib/utils/getNameInitials";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/helpers/cn";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarFallbackClass } from "@/lib/utils/getAvatarColor";
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
        return { uuid: by?.user_uuid || "", name: displayNameOf(by) || "", profileKey: by?.user_profile_object_key };
    });
}

interface Props {
    participants: ThreadParticipant[];
    maxShown?: number;
    className?: string;
}

/**
 * One face in the pile: round and in the person's hue, as their avatar is on
 * every message (seeded by the name), with one initial and a ring of the
 * page's colour where it overlaps the next. They were 20px grey squares with
 * two initials at 11px, overlapping by 4px with nothing between them, so
 * "MC" and "JW" read as one word, "MCJW". A guest or Slack person keeps the
 * neutral face (not a member).
 */
function ParticipantAvatar({ p }: { p: ThreadParticipant }) {
    const { src } = useUserAvatar(p.relayed ? undefined : p.profileKey);
    const initial = (p.relayed ? relayInitials(p.name) : getNameInitials(p.name || "?")).charAt(0);
    return (
        <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
                <span data-participant="" className="relative inline-flex shrink-0 rounded-full ring-2 ring-background">
                    <Avatar className="size-5">
                        {src ? <AvatarImage src={src} alt={p.name} /> : null}
                        <AvatarFallback
                            className={cn(
                                "text-2xs font-semibold leading-none",
                                p.relayed ? "bg-muted text-muted-foreground" : getAvatarFallbackClass(p.name),
                            )}
                        >
                            {initial}
                        </AvatarFallback>
                    </Avatar>
                </span>
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
        <div data-participants="" className={cn("flex items-center -space-x-1", className)}>
            {shown.map((p) => (
                <ParticipantAvatar key={p.uuid} p={p} />
            ))}
            {remaining > 0 && (
                <span className="relative inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-2xs font-medium text-muted-foreground ring-2 ring-background">
                    +{remaining}
                </span>
            )}
        </div>
    );
}
