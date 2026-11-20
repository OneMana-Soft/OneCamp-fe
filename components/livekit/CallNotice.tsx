"use client"

import { useEffect, useRef, type ComponentType, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Captions } from "@/lib/icons"
import { captionsWhereText, type CallTranscription } from "./callState"
import type { AskedNoticeProps } from "./AskedNotice"
import { callNoticeCard } from "./callNoticeCard"

// The notices over a call's stage (captions on, a recording started). Imported
// by the call alone (VideoConference, RecordingNotice), so neither the stage's
// shared pieces (CallStage) nor a green room or guest page carries them.

/**
 * A notice over the call's stage (captions turned on, a recording started): a
 * title with its mark, what it means, the notice's own actions and Got it.
 * One shell, so every call notice reads and answers alike: Esc is Got it, and
 * Got it takes the focus only from nowhere, never from a field someone is
 * typing in or a control they just used. data names the notice
 * ({ "data-captions-notice": "" }). Leave call, where given, leaves. One that
 * asks (a guest, zoom-09) is the one asks gives (the guest's page's
 * LazyAskedNotice): OK or Leave call, nothing else.
 */
export function CallNotice({
  mark,
  title,
  body,
  actions,
  onDismiss,
  onLeave,
  asks,
  failed,
  busy,
  data,
}: {
  mark: ReactNode
  title: string
  body: ReactNode
  actions?: ReactNode
  onDismiss: () => void
  onLeave?: () => void
  asks?: ComponentType<AskedNoticeProps>
  failed?: boolean
  busy?: boolean
  data: Record<`data-${string}`, string>
}) {
  const gotIt = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const at = document.activeElement
    if (!at || at === document.body) gotIt.current?.focus({ preventScroll: true })
  }, [])
  const Asked = asks
  if (Asked && onLeave) return <Asked mark={mark} title={title} body={body} failed={failed} busy={busy} onOk={onDismiss} onLeave={onLeave} data={data} />
  return (
    <div
      role="status"
      data-escape-own=""
      onKeyDown={(e) => {
        if (e.key !== "Escape") return
        e.stopPropagation()
        onDismiss()
      }}
      className={`hub-pop-down ${callNoticeCard}`}
      {...data}
    >
      <p className="flex items-center gap-2 font-medium">
        {mark}
        {title}
      </p>
      <p className="mt-1 text-pretty text-[#A8ABB1]">{body}</p>
      <div className="mt-2.5 flex flex-wrap justify-end gap-2">
        {actions}
        {onLeave && (
          <Button size="sm" variant="ghost" onClick={onLeave} className="text-danger-ink hover:text-danger-ink">
            Leave call
          </Button>
        )}
        <Button ref={gotIt} size="sm" variant="secondary" onClick={onDismiss}>
          Got it
        </Button>
      </div>
    </div>
  )
}

/**
 * The first thing each person reads when captions come on (CALL-BUG-2): who
 * turned them on and where their own speech goes, before anything they say
 * is sent. It stays until they say they've read it; the pill keeps saying it
 * after that.
 */
export function CaptionsNotice({
  transcription,
  onDismiss,
  captioningMe,
  onToggleMe,
  onLeave,
  asks,
  failed,
  busy,
}: {
  transcription: CallTranscription
  onDismiss: () => void
  captioningMe?: boolean
  onToggleMe?: () => void
  onLeave?: () => void
  asks?: ComponentType<AskedNoticeProps>
  failed?: boolean
  busy?: boolean
}) {
  return (
    <CallNotice
      data={{ "data-captions-notice": "" }}
      mark={<Captions className="size-4 shrink-0 text-[#A8ABB1]" aria-hidden />}
      title={transcription.by ? `${transcription.by} turned on captions` : "Captions are on"}
      body={captionsWhereText(transcription)}
      onDismiss={onDismiss}
      onLeave={onLeave}
      asks={asks}
      failed={failed}
      busy={busy}
      actions={
        onToggleMe && captioningMe !== false ? (
          <Button size="sm" variant="ghost" onClick={onToggleMe}>
            Stop captioning me
          </Button>
        ) : null
      }
    />
  )
}
