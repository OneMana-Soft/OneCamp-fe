"use client"

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react"
import { Check } from "@/lib/icons"
import { ToastAction } from "@/components/ui/toast"
import { toast } from "@/hooks/use-toast"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { ix } from "@/lib/ui/interactive"
import { cn } from "@/lib/utils/helpers/cn"
import { responseOf, type GuestResponse } from "@/lib/calendar/answers"
import type { Answer } from "@/lib/calendar/eventsApi"

const CHOICES: { value: Answer; label: string }[] = [
  { value: "accepted", label: "Yes" },
  { value: "tentative", label: "Maybe" },
  { value: "declined", label: "No" },
]

/** Each chosen segment's tint and ink (STEP4_PLAN §4 #5): yes moss, maybe sun, no danger. */
const CHOSEN: Record<Answer, string> = {
  accepted: cn(HUE_CLASS.moss, "bg-hue-tint text-hue-ink"),
  tentative: cn(HUE_CLASS.sun, "bg-hue-tint text-hue-ink"),
  declined: "bg-destructive/10 text-danger-ink",
}

/**
 * "Going? Yes / Maybe / No" (STEP4_PLAN §4 #5, calendar A2): a guest's
 * answer as three segments in a well, each a word, the chosen one in its tint
 * (yes with a check, maybe with a "?"). 28 px tall under a pointer, 44 under
 * a finger. A radio group named "Going?": the arrows move the answer.
 *
 * Optimistic: the answer shows at once and is sent; one that couldn't be sent
 * springs back, and a toast says so with Retry. One the sender didn't send
 * (the "which events?" question closed) springs back and says nothing.
 */
export function GoingControl({
  answer,
  onAnswer,
  touch = false,
  className,
}: {
  /** The answer as the server has it. */
  answer: string | undefined
  /** Sends an answer: true when it went, false when it couldn't, null when it wasn't sent. */
  onAnswer: (a: Answer) => Promise<boolean | null>
  /** 44 px segments whatever the pointer: the phone's sheet. */
  touch?: boolean
  className?: string
}) {
  const labelId = useId()
  const sent = responseOf(answer)
  const [shown, setShown] = useState<GuestResponse>(sent)
  const sending = useRef(0)
  // The server's answer, once nothing is on its way.
  useEffect(() => {
    if (!sending.current) setShown(sent)
  }, [sent])
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  const pick = async (a: Answer) => {
    if (a === shown) return
    const before = shown
    setShown(a)
    sending.current++
    const ok = await onAnswer(a).catch(() => false)
    sending.current--
    if (ok) return
    setShown(before)
    if (ok === null) return
    toast({
      title: "Couldn't send your answer. Try again.",
      variant: "destructive",
      action: (
        <ToastAction altText="Send your answer again" onClick={() => void pick(a)}>
          Retry
        </ToastAction>
      ),
    })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = (i + step + CHOICES.length) % CHOICES.length
    buttons.current[next]?.focus()
    void pick(CHOICES[next].value)
  }

  // The answer given takes the tab stop; with none yet, Yes does.
  const tabStop = Math.max(0, CHOICES.findIndex((c) => c.value === shown))
  return (
    <div className={cn("flex items-center justify-between gap-3", className)} data-going={shown}>
      <span id={labelId} className="text-ui-sm text-ink-2">
        Going?
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="flex gap-0.5 rounded-md bg-hover p-0.5" data-touch-group="">
        {CHOICES.map((c, i) => {
          const on = shown === c.value
          return (
            <button
              key={c.value}
              ref={(el) => {
                buttons.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={i === tabStop ? 0 : -1}
              onClick={() => void pick(c.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
              data-answer={c.value}
              data-touch-target=""
              {...ix("toggle")}
              className={cn(
                "inline-flex h-7 min-w-14 items-center justify-center gap-1 rounded-sm px-2.5 text-ui-sm font-[510] text-ink-2 outline-none",
                "transition-colors duration-[120ms] hover:text-ink focus-visible:ring-2 focus-visible:ring-brand pointer-coarse:h-11 pointer-coarse:min-w-16",
                touch && "h-11 min-w-16",
                on && CHOSEN[c.value],
              )}
            >
              {on && c.value === "accepted" ? <Check className="size-3.5" aria-hidden="true" /> : null}
              {on && c.value === "tentative" ? <span aria-hidden="true">?</span> : null}
              {c.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
