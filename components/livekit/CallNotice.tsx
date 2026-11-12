"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Captions } from "@/lib/icons"
import { captionsWhereText, type CallTranscription } from "./callState"

// The notices over a call's stage (captions on, a recording started). Imported
// by the call alone (VideoConference, RecordingNotice), so neither the stage's
// shared pieces (CallStage) nor a green room or guest page carries them.

/**
 * A notice over the call's stage (captions turned on, a recording started): a
 * title with its mark, what it means, the notice's own actions and Got it.
 * One shell, so every call notice reads and answers alike: Esc is Got it, and
 * Got it takes the focus only from nowhere, never from a field someone is
 * typing in or a control they just used. data names the notice
 * ({ "data-captions-notice": "" }).
 */
export function CallNotice({
  mark,
  title,
  body,
  actions,
  onDismiss,
  data,
}: {
  mark: ReactNode
  title: string
  body: ReactNode
  actions?: ReactNode
  onDismiss: () => void
  data: Record<`data-${string}`, string>
}) {
  const gotIt = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const at = document.activeElement
    if (!at || at === document.body) gotIt.current?.focus({ preventScroll: true })
  }, [])
  return (
    <div
      role="status"
      data-escape-own=""
      onKeyDown={(e) => {
        if (e.key !== "Escape") return
        e.stopPropagation()
        onDismiss()
      }}
      className="hub-pop-down pointer-events-auto w-full max-w-[440px] rounded-[14px] bg-[#1F2024] p-3 text-ui-sm text-[#EEEEF0] shadow-e3 ring-1 ring-white/[0.09]"
      {...data}
    >
      <p className="flex items-center gap-2 font-medium">
        {mark}
        {title}
      </p>
      <p className="mt-1 text-pretty text-[#A8ABB1]">{body}</p>
      <div className="mt-2.5 flex flex-wrap justify-end gap-2">
        {actions}
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
}: {
  transcription: CallTranscription
  onDismiss: () => void
  captioningMe?: boolean
  onToggleMe?: () => void
}) {
  return (
    <CallNotice
      data={{ "data-captions-notice": "" }}
      mark={<Captions className="size-4 shrink-0 text-[#A8ABB1]" aria-hidden />}
      title={transcription.by ? `${transcription.by} turned on captions` : "Captions are on"}
      body={captionsWhereText(transcription)}
      onDismiss={onDismiss}
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
