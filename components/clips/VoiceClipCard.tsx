"use client"

import * as React from "react"
import { useMediaFetch } from "@/hooks/useFetch"
import type { GetMediaURLRes } from "@/types/file"
import type { AttachmentMediaReq } from "@/types/attachment"
import { Pause, Play } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { formatDuration } from "@/lib/utils/format/formatDuration"

const BARS = 48

/** A voice clip recorded here (ClipRecorder names them "Voice clip …"), audio only. */
export function isVoiceClip(a: Pick<AttachmentMediaReq, "attachment_file_name" | "attachment_raw_type">): boolean {
    return /^Voice clip \d{4}-\d{2}-\d{2} /.test(a.attachment_file_name || "") && (!a.attachment_raw_type || a.attachment_raw_type.startsWith("audio/"))
}

/**
 * The clip's 48 bar heights, 20 to 100%, from its id. The clip's samples are
 * not stored with it and decoding every clip on screen would download them
 * all, so the shape is the clip's own (one id, one shape, every time) rather
 * than its loudness. Pure, for its test.
 */
export function waveformOf(id: string, bars = BARS): number[] {
    let h = 2166136261
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
    const out: number[] = []
    for (let i = 0; i < bars; i++) {
        h = Math.imul(h ^ (h >>> 15), 2246822507) ^ i
        const r = ((h >>> 0) % 1000) / 1000
        // Softer at the ends, as speech starts and trails.
        const edge = Math.sin(((i + 0.5) / bars) * Math.PI)
        out.push(Math.round(20 + 80 * (0.35 + 0.65 * r) * (0.55 + 0.45 * edge)))
    }
    return out
}

/**
 * A voice clip under a message (design v3 chat, C57): a 44px player on the
 * card material, a berry play disc, the 48-bar waveform filling in berry as
 * it plays, and its length in tabular figures. One button to play or pause.
 */
export function VoiceClipCard({ attachment, mediaGetUrl }: { attachment: AttachmentMediaReq; mediaGetUrl: string }) {
    const media = useMediaFetch<GetMediaURLRes>(attachment.attachment_uuid ? `${mediaGetUrl}/${attachment.attachment_uuid}` : "")
    const audio = React.useRef<HTMLAudioElement | null>(null)
    const [playing, setPlaying] = React.useState(false)
    const [at, setAt] = React.useState(0)
    const [length, setLength] = React.useState(attachment.attachment_duration || 0)
    const bars = React.useMemo(() => waveformOf(attachment.attachment_uuid), [attachment.attachment_uuid])
    const played = length > 0 ? at / length : 0

    const toggle = (e: React.MouseEvent) => {
        e.stopPropagation()
        const el = audio.current
        if (!el || !media.data?.url) return
        if (el.paused) void el.play()
        else el.pause()
    }

    return (
        <div data-voice-clip="" className="hue-berry flex h-11 w-full max-w-[360px] items-center gap-2.5 rounded-xl bg-raised pl-1.5 pr-3 shadow-e1">
            <button
                type="button"
                data-no-ripple="true"
                onClick={toggle}
                disabled={!media.data?.url}
                aria-label={`${playing ? "Pause" : "Play"} ${attachment.attachment_file_name}`}
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-hue text-white transition-transform duration-[90ms] active:scale-[0.94] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
                {playing ? <Pause className="size-4 fill-white" /> : <Play className="ml-0.5 size-4 fill-white" />}
            </button>
            <span data-waveform="" aria-hidden="true" className="flex h-6 min-w-0 flex-1 items-center gap-px">
                {bars.map((h, i) => (
                    <span
                        key={i}
                        className={cn("flex-1 rounded-[1px] transition-colors duration-150", (i + 0.5) / bars.length <= played ? "bg-hue" : "bg-line-3")}
                        style={{ height: `${h}%` }}
                    />
                ))}
            </span>
            <span className="shrink-0 text-meta tabular-nums text-ink-3">{formatDuration(Math.round(playing || at > 0 ? at : length))}</span>
            {media.data?.url && (
                <audio
                    ref={audio}
                    src={media.data.url}
                    preload="metadata"
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onEnded={() => { setPlaying(false); setAt(0) }}
                    onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)}
                    onLoadedMetadata={(e) => { if (Number.isFinite(e.currentTarget.duration)) setLength(e.currentTarget.duration) }}
                />
            )}
        </div>
    )
}
