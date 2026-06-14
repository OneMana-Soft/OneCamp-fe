"use client";

import * as React from "react";
import { useUserAvatar } from "@/hooks/useUserAvatar";
import { getNameInitials } from "@/lib/utils/getNameInitials";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/helpers/cn";

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
}

interface Props {
    participants: ThreadParticipant[];
    maxShown?: number;
    className?: string;
}

function ParticipantAvatar({ p }: { p: ThreadParticipant }) {
    const { src } = useUserAvatar(p.profileKey);
    return (
        <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
                <div className="relative flex items-center justify-center rounded-[5px] overflow-hidden size-5 border border-background bg-muted text-[9px] font-semibold text-muted-foreground">
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
                        getNameInitials(p.name || "?")
                    )}
                </div>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6} className="px-2 py-0.5 text-[11px] font-medium">
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
                <div className="flex items-center justify-center rounded-[5px] size-5 border border-background bg-muted text-[9px] font-medium text-muted-foreground">
                    +{remaining}
                </div>
            )}
        </div>
    );
}
