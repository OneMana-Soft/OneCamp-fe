import { displayNameOf } from "@/lib/personName"
import React from "react";
import { Hash, Play, Trash2, Users } from "@/lib/icons";
import {RecordingInfoInterface} from "@/types/recording";
import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {UserProfileInterface} from "@/types/user";
import {GetEndpointUrl} from "@/services/endPoints";
import { shortDateTime } from "@/lib/utils/date/shortDate";
import { IdentityMark } from "@/components/ui/graphics/IdentityMark";
import { cn } from "@/lib/utils/helpers/cn";

/** How long a call ran, in words: "45 s", "12 min", "1 h 5 min". */
export function callLength(seconds: number): string {
    const s = Math.max(0, Math.round(seconds || 0))
    if (s < 60) return `${s} s`
    const m = Math.floor(s / 60)
    if (m < 60) return `${m} min`
    const h = Math.floor(m / 60)
    return m % 60 ? `${h} h ${m % 60} min` : `${h} h`
}

/** Where the call was: "#engineering", the other person, or the group's people. */
export function recordingPlace(rec: RecordingInfoInterface, selfId?: string): string {
    if (rec.recording_channel?.ch_name) return `#${rec.recording_channel.ch_name}`
    const others = (rec.recording_dm?.dm_participants || []).filter((p) => p.user_uuid !== selfId)
    const names = others.map((p) => displayNameOf(p)).filter(Boolean)
    return names.length ? names.join(", ") : "Direct message"
}

/**
 * One recorded call, as a row of the app's lists (Later, search): the place
 * in its own colour, its name, who started it with how long it ran and its
 * size, and when at the right edge.
 *
 * It was a card of its own: a 48px green tile with a ring and a shadow that
 * grew under the pointer, an orange bar and tint on hover, the title in bold
 * with "# " spaced off the name, the date in a pill, the length in seconds in
 * an orange chip, and a play button in the accent. Given `onOpen`, the row is
 * a button, so it opens from the keyboard too.
 */
export const RecordingListRecording = ({
    recordingInfo,
    currentUserId: propUserId,
    onDelete,
    onOpen,
}: {
    recordingInfo: RecordingInfoInterface
    currentUserId?: string
    onDelete?: (egressId: string) => void
    /** Opens the player. Without it the row is a plain block inside whatever handles the click. */
    onOpen?: () => void
}) => {
    const { data: selfProfile } = useFetchOnlyOnce<UserProfileInterface>(propUserId ? "" : GetEndpointUrl.SelfProfile);
    const currentUserId = propUserId || selfProfile?.data?.user_uuid;
    const rec = recordingInfo
    const place = recordingPlace(rec, currentUserId)
    const others = (rec.recording_dm?.dm_participants || []).filter((p) => p.user_uuid !== currentUserId)

    const startedAt = new Date(rec.recording_stared_at)
    const when = Number.isNaN(startedAt.getTime()) ? "" : shortDateTime(startedAt)
    const starter = displayNameOf(rec.recording_started_by)
    const details = [
        starter ? `Started by ${starter}` : "",
        rec.recording_duration > 0 ? callLength(rec.recording_duration) : "",
        rec.recording_size > 0 ? `${(rec.recording_size / (1024 * 1024)).toFixed(1)} MB` : "",
    ].filter(Boolean)

    const mark = rec.recording_channel?.ch_uuid ? (
        <IdentityMark variant="tile" size={24} id={rec.recording_channel.ch_uuid} icon={<Hash strokeWidth={1.75} />} />
    ) : others.length === 1 ? (
        <IdentityMark variant="avatar" size={24} id={others[0].user_uuid} label={displayNameOf(others[0])} />
    ) : (
        <IdentityMark variant="tile" size={24} id={rec.recording_dm?.dm_grouping_id} icon={<Users strokeWidth={1.75} />} />
    )

    const body = (
        <>
            <span className="-mt-0.5 shrink-0">{mark}</span>
            <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{place}</span>
                    {when && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{when}</span>}
                </span>
                {details.length > 0 && (
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{details.join(" · ")}</span>
                )}
            </span>
        </>
    )

    const rowClass = "group/row flex min-w-0 flex-1 items-start gap-3 rounded-md px-2 py-3 text-left transition-colors duration-100 hover:bg-highlight"

    return (
        <div data-recording-row="" className="group/rec flex items-center gap-1">
            {onOpen ? (
                <button
                    type="button"
                    onClick={onOpen}
                    aria-label={`Play the recording, ${place}${when ? `, ${when}` : ""}`}
                    className={cn(rowClass, "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70")}
                >
                    {body}
                    {/* Says what a click does, where a pointer can see it. */}
                    <Play aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-visible/row:opacity-100 [@media(hover:none)]:hidden" />
                </button>
            ) : (
                <div className={rowClass}>{body}</div>
            )}
            {onDelete && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation()
                        if (rec.recording_egress_id) onDelete(rec.recording_egress_id)
                    }}
                    aria-label="Delete recording"
                    title="Delete recording"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-danger-ink focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 group-hover/rec:opacity-100 [@media(hover:none)]:opacity-100"
                >
                    <Trash2 className="h-4 w-4" />
                </button>
            )}
        </div>
    );
};
