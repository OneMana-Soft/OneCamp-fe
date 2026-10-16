import { displayNameOf } from "@/lib/personName"
import React from "react";
import { Play, Trash2 } from "@/lib/icons";
import {RecordingInfoInterface} from "@/types/recording";
import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {UserProfileInterface} from "@/types/user";
import {GetEndpointUrl} from "@/services/endPoints";
import { shortDateTime } from "@/lib/utils/date/shortDate";
import { HUE_CLASS } from "@/components/ui/graphics/hues";
import { HubRow, HubToolButton } from "@/components/ui/hubRow";
import { hueFor } from "@/lib/campHue";
import { formatElapsed } from "@/components/livekit/callLevels";
import { cn } from "@/lib/utils/helpers/cn";
import { clockTime } from "@/lib/utils/date/clock";

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
 * Whose colour a recording wears: its channel, the other person, or the
 * group. A person keys on their name, as their avatar does (personHue).
 */
export function recordingHueKey(rec: RecordingInfoInterface, selfId?: string): string {
    if (rec.recording_channel?.ch_uuid) return rec.recording_channel.ch_uuid
    const others = (rec.recording_dm?.dm_participants || []).filter((p) => p.user_uuid !== selfId)
    return others.length === 1 ? displayNameOf(others[0]) || others[0].user_uuid : rec.recording_dm?.dm_grouping_id || rec.recording_egress_id
}

/**
 * The 40 x 28 thumbnail (hub.md C13): the place's hue gradient with a white
 * play triangle, and the length in its corner when it is known.
 */
export function RecordingThumb({ hueKey, seconds }: { hueKey: string; seconds?: number }) {
    const hue = hueFor(hueKey)
    return (
        <span data-recording-thumb="" data-hue={hue} className={cn(HUE_CLASS[hue], "avatar-person relative grid h-7 w-10 place-items-center rounded-[6px]")}>
            {/* With the length shown, the triangle moves to the top-left: centred,
                the badge sat on top of it in a 28px-tall thumbnail. */}
            <Play
                aria-hidden="true"
                data-thumb-play=""
                className={cn(
                    "fill-white text-white transition-transform duration-150 group-hover/hubrow:scale-110",
                    seconds && seconds > 0 ? "absolute left-1.5 top-[3px] size-2.5" : "size-3",
                )}
            />
            {seconds && seconds > 0 ? (
                <span data-duration-badge="" className="absolute right-[2px] bottom-[2px] rounded-[3px] bg-black/60 px-[3px] text-3xs font-semibold leading-3 tabular-nums text-white">
                    {formatElapsed(seconds * 1000)}
                </span>
            ) : null}
        </span>
    )
}

/**
 * One recorded call, as a two-line HubRow (hub.md C13): the thumbnail in the
 * place's colour with its length, the place, who started it and how big, a
 * Transcript tag when there is one, and when at the right edge. Hover brings
 * the toolbar: Play and Delete. Given `onOpen`, the row plays it, from the
 * keyboard too.
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

    const startedAt = new Date(rec.recording_stared_at)
    const when = Number.isNaN(startedAt.getTime()) ? "" : shortDateTime(startedAt)
    const time = Number.isNaN(startedAt.getTime()) ? "" : clockTime(startedAt)
    const starter = displayNameOf(rec.recording_started_by)
    const details = [
        starter ? `Started by ${starter}` : "",
        rec.recording_size > 0 ? `${(rec.recording_size / (1024 * 1024)).toFixed(1)} MB` : "",
    ].filter(Boolean)
    const transcript = (rec.recording_transcript?.length ?? 0) > 0

    const del = onDelete && rec.recording_egress_id
        ? () => onDelete(rec.recording_egress_id)
        : undefined

    return (
        <HubRow
            data-recording-row=""
            density="two-line"
            leadSize={40}
            lead={<RecordingThumb hueKey={recordingHueKey(rec, currentUserId)} seconds={rec.recording_duration} />}
            title={place}
            second={
                details.length || transcript ? (
                    <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate">{details.join(" · ")}</span>
                        {transcript ? (
                            <span className="inline-flex h-[18px] shrink-0 items-center rounded-[5px] bg-hover px-1.5 text-micro text-ink-2 ring-1 ring-inset ring-line">Transcript</span>
                        ) : null}
                    </span>
                ) : undefined
            }
            meta={time || undefined}
            tools={
                onOpen || del ? (
                    <>
                        {onOpen ? (
                            <HubToolButton label="Play" onClick={onOpen}>
                                <Play />
                            </HubToolButton>
                        ) : null}
                        {del ? (
                            <HubToolButton label="Delete recording" className="text-danger-ink hover:text-danger-ink" onClick={del}>
                                <Trash2 />
                            </HubToolButton>
                        ) : null}
                    </>
                ) : undefined
            }
            {...(onOpen
                ? {
                      role: "button",
                      tabIndex: 0,
                      "aria-label": `Play the recording, ${place}${when ? `, ${when}` : ""}`,
                      onClick: onOpen,
                      onKeyDown: (e: React.KeyboardEvent) => {
                          if (e.target !== e.currentTarget) return
                          if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              onOpen()
                          }
                      },
                  }
                : {})}
        />
    )
};
