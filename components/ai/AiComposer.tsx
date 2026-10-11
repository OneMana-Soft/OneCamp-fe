"use client"

import "./ai.css"
/**
 * The AI composer (hub.md AI10): v3's floating composer, one step rounder than
 * a channel's (r16, because it is the page's main object), raised at e2. The
 * accent never shows at rest: the input halo (1 px brand at 50% and a 3 px
 * halo at 12%) appears only while it has focus, and an empty Send is a quiet
 * press-grey square with an ink-3 arrow, turning brand only once there is
 * something to send. While an answer streams Send becomes Stop, an ink square
 * with a sheet-coloured stop glyph; Esc stops too.
 */
import * as React from "react"

import { ArrowUp, Mic } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

export interface AiComposerProps {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onStop: () => void
  streaming: boolean
  /** "page" is taller and wider (min 88). */
  size?: "panel" | "page"
  disabled?: boolean
  /** Why it is disabled, under the box (offline, over the limit). */
  disabledNote?: string
  mic?: { available: boolean; recording: boolean; busy: boolean; label: string; toggle: () => void }
  inputRef?: React.Ref<HTMLTextAreaElement>
  className?: string
  /** The composer element itself, for the page's glide (FLIP). */
  boxRef?: React.Ref<HTMLDivElement>
}

const MAX_HEIGHT = 280

export function AiComposer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  size = "panel",
  disabled,
  disabledNote,
  mic,
  inputRef,
  className,
  boxRef,
}: AiComposerProps) {
  const local = React.useRef<HTMLTextAreaElement | null>(null)
  const setRef = (el: HTMLTextAreaElement | null) => {
    local.current = el
    if (typeof inputRef === "function") inputRef(el)
    else if (inputRef) (inputRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el
  }
  const min = size === "page" ? 40 : 24

  // Grows with what is typed, up to 280 px, and shrinks back: measured after
  // the value is in the DOM, with no height transition (a transition would
  // read a stale scrollHeight and the box would never shrink).
  React.useLayoutEffect(() => {
    const el = local.current
    if (!el) return
    el.style.height = `${min}px`
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  }, [value, min])

  const empty = !value.trim()
  return (
    <div className={className}>
      <div
        ref={boxRef}
        data-ai-composer=""
        className={cn(
          "ai-composer bg-raised pb-2 pl-3.5 pr-2.5 pt-3",
          size === "page" ? "min-h-[88px]" : "min-h-[76px]",
          disabled && "opacity-70",
        )}
      >
        <textarea
          ref={setRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              if (!streaming) onSend()
            } else if (e.key === "Escape" && streaming) {
              e.preventDefault()
              onStop()
            }
          }}
          readOnly={disabled}
          rows={1}
          placeholder="Ask your workspace anything…"
          aria-label="Message AI assistant"
          className="block w-full resize-none bg-transparent text-body leading-[23px] tracking-[-0.009em] text-foreground outline-none transition-none placeholder:text-ink-3"
          style={{ minHeight: min, maxHeight: MAX_HEIGHT }}
        />
        <div className="mt-2 flex items-center gap-0.5">
          <span className="flex-1" />
          {mic?.available && !streaming ? (
            <button
              type="button"
              onClick={mic.toggle}
              disabled={mic.busy || disabled}
              aria-label={mic.label}
              title={mic.label}
              className={cn(
                "grid size-7 place-items-center rounded-full transition-colors [&_svg]:size-3.5",
                mic.recording ? "bg-destructive/10 text-danger-ink" : "text-ink-3 hover:bg-hover hover:text-foreground",
              )}
            >
              {mic.recording ? <span className="size-1.5 rounded-full bg-destructive" aria-hidden /> : <Mic className={mic.busy ? "hub-breathe" : undefined} />}
            </button>
          ) : null}
          {streaming ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop generating"
              title="Stop (Esc)"
              data-stop=""
              className="grid size-7 place-items-center rounded-md bg-foreground transition-transform duration-[90ms] active:scale-95"
            >
              <span className="size-2.5 rounded-[2px] bg-sheet" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSend}
              disabled={empty || disabled}
              aria-label="Send message"
              title="Send (Enter)"
              data-send={empty ? "empty" : "ready"}
              className={cn(
                "grid size-7 place-items-center rounded-md transition-[background-color,translate] duration-[90ms] active:translate-y-px [&_svg]:size-3.5",
                empty || disabled ? "bg-press text-ink-3" : "ai-send-ready bg-brand text-brand-foreground",
              )}
            >
              <ArrowUp />
            </button>
          )}
        </div>
      </div>
      {disabledNote ? (
        <p className="mt-1.5 px-1 text-meta text-ink-3" role="status">
          {disabledNote}
        </p>
      ) : (
        // Space held whether or not the hint shows, so typing never moves the thread.
        <p
          className={cn("mt-1.5 hidden h-[18px] items-center gap-1 px-1 text-meta text-ink-3 sm:flex [@media(pointer:coarse)]:hidden", !empty && "invisible")}
          data-composer-hint=""
        >
          <kbd className="kbd">↵</kbd> send · <kbd className="kbd">⇧↵</kbd> new line
        </p>
      )}
    </div>
  )
}
