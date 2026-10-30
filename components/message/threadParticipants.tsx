"use client";

import { displayNameOf } from "@/lib/personName"
import * as React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/helpers/cn";
import { ChatFace } from "@/components/message/chatFace";
import { relayedAuthorOf } from "@/lib/relayedAuthor";

/**
 * ThreadParticipants — a small avatar facepile of the people who replied in a
 * thread, shown next to the "N replies" badge (Slack-parity polish).
 *
 * Participants are derived from the reply authors already present in the
 * message's comment list — no extra fetch: a page brings up to three of a
 * thread's people (domain/Message KeepRepliers, chat P2), and a reply written
 * in the session joins them. Deduped by uuid, newest first, three at most.
 * Avatars are intentionally small to sit inline.
 */

export interface ThreadParticipant {
    uuid: string;
    name: string;
    profileKey?: string;
    /** A guest or Slack person, not a member: their hue, no image. */
    relayed?: boolean;
    /** An agent or a bot: drawn as its square, not a person's circle. */
    isBot?: boolean;
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
        return { uuid: by?.user_uuid || "", name: displayNameOf(by) || "", profileKey: by?.user_profile_object_key, isBot: !!by?.is_bot };
    });
}

interface Props {
    participants: ThreadParticipant[];
    maxShown?: number;
    className?: string;
    /** Face size in px (20 under a message). */
    size?: number;
    /**
     * What clicking a face does, and what it's called (the face's label and
     * its tooltip): a table's faces go to the cell each person is on. A face
     * it gives nothing for stays a face, named.
     */
    actionFor?: (p: ThreadParticipant) => FaceAction | null;
}

/** A face's click, and its name. */
export interface FaceAction {
    label: string;
    run: () => void;
}

/**
 * One face in the pile: round and in the person's hue, as their avatar is on
 * every message (seeded by the name), with one initial and a ring of the
 * page's colour where it overlaps the next. They were 20px grey squares with
 * two initials at 11px, overlapping by 4px with nothing between them, so
 * "MC" and "JW" read as one word, "MCJW". A guest or Slack person keeps the
 * neutral face (not a member).
 */
function ParticipantAvatar({ p, size, action }: { p: ThreadParticipant; size: number; action: FaceAction | null }) {
    const face = <ChatFace name={p.name} profileKey={p.profileKey} userUUID={p.uuid} isBot={p.isBot} relayed={p.relayed} size={size} />;
    return (
        <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
                {action ? (
                    // A face that does something lifts from the pile under the pointer, over its neighbours.
                    <button
                        type="button"
                        data-participant=""
                        aria-label={action.label}
                        onClick={action.run}
                        className="relative inline-flex shrink-0 cursor-pointer rounded-full ring-2 ring-sheet outline-none transition-transform duration-150 ease-out hover:z-10 hover:-translate-y-px focus-visible:z-10 focus-visible:ring-brand"
                    >
                        {face}
                    </button>
                ) : (
                    <span data-participant="" className="relative inline-flex shrink-0 rounded-full ring-2 ring-sheet">
                        {face}
                    </span>
                )}
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6} className="px-2 py-0.5 text-2xs font-medium">
                {action?.label ?? p.name}
            </TooltipContent>
        </Tooltip>
    );
}

export function ThreadParticipants({ participants, maxShown = 3, className, size = 20, actionFor }: Props) {
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

    // The newest people, and no "+N" (STEP5_PLAN spec A): a page brings at most
    // three of a thread's people, so a count of the rest would count only
    // those who replied while it was open.
    const shown = unique.slice(0, maxShown);

    return (
        // Overlapping 4px on a 2px ring of the sheet, so every initial stays
        // whole: at 6px the next face's ring covered part of a "P" or an "M"
        // (DESIGN-BUILD-2, 18 Oct).
        <div data-participants="" className={cn("flex items-center -space-x-1", className)}>
            {shown.map((p) => (
                <ParticipantAvatar key={p.uuid} p={p} size={size} action={actionFor?.(p) ?? null} />
            ))}
        </div>
    );
}
