"use client"

// A background made from words (meet-09): the person describes one, the
// workspace's own model (local, or the provider the workspace set up) writes
// a recipe for it (a few colours, one of the built-ins' layouts, some
// extras), and this browser paints it with the backdrops' painter
// (backdrops.ts). Only the words leave the device, to the workspace's server;
// the picture is painted and kept here. A small model on a computer's CPU
// can take half a minute, so nothing waits on it: the camera keeps what it
// has, the other backgrounds stay usable, and Cancel is always in view.
// A lazy chunk of its own that every picker shares (EffectsChooser, which
// offers it only where the workspace's AI is on: `made`); its frame, and what
// stands in it while it loads, are composerFrame.tsx's. The AI-free edition
// drops both files.
// Its actions (Cancel while making, Use this and the remake once made) go in
// the host's pinned foot where it has one (EffectsFoot: the green room's
// sheet, the call's panel), else under the preview, brought into view as it
// lands. Focus never drops to the page: a step that takes away the focused
// button hands it to the next step's own control, and the composer, landing
// where its loading frame held the focus, takes it.

import * as React from "react"
import { createPortal } from "react-dom"
import { Loader2 } from "@/lib/icons"
import { isAxiosError } from "axios"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { isAppOffline, subscribeConnectivity } from "@/lib/connectivity"
import { CallsPost } from "@/services/endpoints/calls"
import { prefersReducedMotion } from "@/lib/reducedMotion"
import { isTouchScreen } from "@/lib/ui/touchScreen"
import { act, ComposerClose, EXAMPLE, EXAMPLES, FAILED, focusDropped, FRAME, HEAD, NOTE, TITLE, type ComposerProps } from "./composerFrame"

/** The most the server takes (business/AI MaxCallSceneWords). */
export const WORDS_MAX = 200

type State =
  | { at: "idle" }
  | { at: "making" }
  | { at: "made"; picture: Blob; url: string; by: string; said: string }
  | { at: "failed"; why: string }

const notOffline = () => false

/** What a refusal says: the server's words where the person can change something (too long, too often, AI off), else the plain failure. */
function refusal(status: number, msg: unknown): string {
  if (typeof msg === "string" && msg && (status === 400 || status === 429 || msg === "AI is switched off in this workspace.")) return msg
  return FAILED
}

/** Where focus goes when a step takes away the button that held it. */
type Aim = "words" | "make" | "cancel" | "use"

export default function AiBackground({ onUse, onClose, paint, foot }: ComposerProps) {
  const id = React.useId()
  const [words, setWords] = React.useState("")
  const [state, setState] = React.useState<State>({ at: "idle" })
  const offline = React.useSyncExternalStore(subscribeConnectivity, isAppOffline, notOffline)
  const asking = React.useRef<AbortController | null>(null)
  const shown = React.useRef<string | null>(null)
  const held = React.useRef(false)
  const aim = React.useRef<Aim>("words")
  const field = React.useRef<HTMLInputElement>(null)
  const makeButton = React.useRef<HTMLButtonElement>(null)
  const cancelButton = React.useRef<HTMLButtonElement>(null)
  const useButton = React.useRef<HTMLButtonElement>(null)
  const closeButton = React.useRef<HTMLButtonElement>(null)
  const preview = React.useRef<HTMLDivElement>(null)
  const root = React.useRef<HTMLDivElement>(null)

  const show = React.useCallback((next: State) => {
    if (shown.current) URL.revokeObjectURL(shown.current)
    shown.current = next.at === "made" ? next.url : null
    aim.current = next.at === "making" ? "cancel" : next.at === "made" ? "use" : "words"
    setState(next)
  }, [])
  // Closing stops the request (the server's context ends the model's call) and lets the preview go.
  React.useEffect(
    () => () => {
      asking.current?.abort()
      if (shown.current) URL.revokeObjectURL(shown.current)
    },
    [],
  )

  const said = words.trim()
  const make = async () => {
    if (!said || offline) return
    asking.current?.abort()
    const ask = new AbortController()
    asking.current = ask
    show({ at: "making" })
    try {
      // The app's own client, as the call's other asks (CallView): every picker's parent has it, so the composer's
      // chunk brings no shared code of its own (MAIN 11 Nov 'H4b regroup'). A refusal is read, not thrown; a 401
      // still refreshes the session and asks again.
      const res = await axiosInstance.post<{ msg?: unknown; data?: { recipe?: unknown; model?: { label?: unknown } } } | null>(
        CallsPost.AICallBackground,
        { words: said },
        { ...OWN_ERRORS, signal: ask.signal, validateStatus: (status) => status !== 401 },
      )
      const body = res.data && typeof res.data === "object" ? res.data : null
      const recipe = body?.data?.recipe
      if (res.status < 200 || res.status >= 300 || !recipe || typeof recipe !== "object") throw new Error(refusal(res.status, body?.msg))
      const picture = await paint(recipe)
      if (ask.signal.aborted) return
      const label = body?.data?.model?.label
      show({ at: "made", picture, url: URL.createObjectURL(picture), by: typeof label === "string" && label ? label : "the model", said })
    } catch (e) {
      if (ask.signal.aborted) return
      show({ at: "failed", why: e instanceof Error && e.message !== FAILED && !(e instanceof TypeError) && !isAxiosError(e) ? e.message : FAILED })
    } finally {
      if (asking.current === ask) asking.current = null
    }
  }
  const cancel = () => {
    asking.current?.abort()
    asking.current = null
    show({ at: "idle" })
  }

  const making = state.at === "making"
  // Made, and the words are still the preview's: Try again remakes them, and Make it stands down (one primary, one remake).
  const same = state.at === "made" && said === state.said
  const actions = making || state.at === "made"
  // A host's foot holds the actions while there are any.
  const hold = foot?.hold
  React.useEffect(() => {
    hold?.(actions)
  }, [hold, actions])
  React.useEffect(() => () => hold?.(false), [hold])
  // It lands where its loading frame was (EffectsChooser's lazy chunk): focus that frame held went with it, to the
  // page, and is the composer's to take (DB-135 F4).
  React.useLayoutEffect(() => {
    if (focusDropped()) held.current = true
  }, [])
  // Focus dropped (the button that held it went with the step) to the page, or to a sheet round the composer (a
  // dialog's focus trap takes it back to its root): the step's own control takes it, else (Make it, with no words
  // yet) the composer's Close.
  React.useLayoutEffect(() => {
    const now = document.activeElement
    if (!held.current || (now && now.isConnected && !now.contains(root.current))) return
    // On a touch screen the words never take the focus by themselves: their keyboard would cover the sheet.
    const to = { words: field, make: makeButton, cancel: cancelButton, use: useButton }[aim.current === "words" && isTouchScreen() ? "make" : aim.current]
    to.current?.focus()
    if (document.activeElement !== to.current) closeButton.current?.focus()
  })
  // The preview lands: it and its actions come into view (a computer's popover is shorter than the composer).
  React.useEffect(() => {
    if (state.at === "made") preview.current?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" })
  }, [state.at])

  const cancelIt = (
    <button ref={cancelButton} type="button" onClick={cancel} className={act("neutral", foot ? "h-11 flex-1 rounded-[10px] md:h-9" : "h-11 shrink-0 rounded-[10px] md:h-8")}>
      Cancel
    </button>
  )
  const row =
    state.at === "made" ? (
      <div data-made-actions="" className="flex gap-2">
        <button ref={useButton} type="button" onClick={() => void onUse(state.picture)} className={act("primary", "h-11 flex-1 rounded-[10px] md:h-9")}>
          Use this
        </button>
        {same ? (
          <button type="button" onClick={() => void make()} disabled={offline} className={act("neutral", "h-11 flex-1 rounded-[10px] md:h-9")}>
            Try again
          </button>
        ) : null}
      </div>
    ) : making && foot ? (
      <div data-made-actions="" className="flex gap-2">
        {cancelIt}
      </div>
    ) : null
  return (
    <div
      ref={root}
      data-made-background=""
      className={FRAME}
      // Whether focus is in here (the foot's buttons too: React's events cross the portal). A blur to nowhere counts
      // only while its element stays: one a step took away leaves the focus ours to hand on.
      onFocus={() => (held.current = true)}
      onBlur={(e) => {
        const from = e.target
        if (e.relatedTarget) held.current = false
        else
          queueMicrotask(() => {
            if (from.isConnected) held.current = false
          })
      }}
    >
      <div className={HEAD}>
        <label htmlFor={id} className={TITLE}>
          Describe a background
        </label>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void make()
        }}
      >
        <input
          ref={field}
          id={id}
          value={words}
          maxLength={WORDS_MAX}
          onChange={(e) => setWords(e.target.value)}
          readOnly={making}
          autoComplete="off"
          placeholder="A calm beach at sunset"
          className="h-11 min-w-0 flex-1 rounded-[10px] border border-white/[0.08] bg-white/[0.06] px-3 text-base text-[#EEEEF0] outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-brand md:h-9 md:text-ui-sm"
        />
        {making || same ? null : (
          <button ref={makeButton} type="submit" disabled={!said || offline} className={act(state.at === "made" ? "neutral" : "primary", "h-11 shrink-0 rounded-[10px] md:h-9")}>
            Make it
          </button>
        )}
      </form>
      {state.at === "idle" && !said ? (
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                aim.current = "make"
                setWords(example)
              }}
              className={EXAMPLE}
            >
              {example}
            </button>
          ))}
        </div>
      ) : null}
      {making ? (
        <div className="flex items-center justify-between gap-2">
          <p role="status" className="flex items-center gap-1.5 text-meta text-ink-2 [&_svg]:size-3.5">
            <Loader2 aria-hidden className="animate-spin" />
            Making your background…
          </p>
          {foot ? null : cancelIt}
        </div>
      ) : null}
      {state.at === "made" ? (
        // Clear of the fade over a scroller's foot (the popover's, a sheet's footer's) when brought into view.
        <div ref={preview} className="space-y-2" style={{ scrollMarginBottom: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- painted on this device as a blob, never optimised */}
          <img src={state.url} alt="Your background, made from your words" className="aspect-video w-full rounded-[10px] object-cover" data-made-preview="" />
          <p className="text-meta text-ink-3">Made by {state.by}, your workspace&apos;s model. OneCamp doesn&apos;t save your words.</p>
          {foot ? null : row}
        </div>
      ) : null}
      {state.at === "failed" ? (
        <p role="alert" className="text-meta text-[#FFB4B8]">
          {state.why}
        </p>
      ) : null}
      {offline ? (
        <p className="text-meta text-ink-3">You&apos;re offline. Making one needs your workspace&apos;s server.</p>
      ) : state.at === "idle" || state.at === "failed" ? (
        <p className="text-meta text-ink-3">{NOTE}</p>
      ) : null}
      {/* After the words in the tab order: one Tab from the grid reaches them. */}
      <ComposerClose ref={closeButton} onClose={onClose} />
      {foot?.node && row ? createPortal(row, foot.node) : null}
    </div>
  )
}
