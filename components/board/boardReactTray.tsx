"use client"

/**
 * The board's React tray (components/board/boardReact, miro-24): the six reactions, this person's hand and the queue of
 * hands, in a chunk of their own that comes as the pointer or the focus reaches the React button, so the board loads
 * none of it until someone goes to react. What they do is Here now's control (presence/control).
 */
import * as React from "react"
import { usePresenceControl } from "@/components/docEditor/presence/control"
import { HandQueue } from "@/components/docEditor/presence/HandQueue"
import { REACTIONS } from "@/lib/reactions/set"
import { REACTION_NAMES } from "@/lib/reactions/names"

export default function BoardReactTray({ hereKey, onDone }: { hereKey: string; onDone: () => void }) {
  const control = usePresenceControl(hereKey)
  const up = control?.hand?.up ?? false
  return (
    <>
      <div role="group" aria-label="Reactions" className="flex items-center justify-between gap-0.5">
        {REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={REACTION_NAMES[emoji]}
            title={REACTION_NAMES[emoji]}
            onClick={() => {
              // Closed first, so the reaction rises from the button in view.
              onDone()
              control?.react?.(emoji)
            }}
            className="flex size-10 items-center justify-center rounded-lg text-2xl leading-none outline-none transition-transform duration-[140ms] ease-out hover:scale-110 hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand active:scale-95 motion-reduce:transform-none max-sm:size-11"
          >
            {emoji}
          </button>
        ))}
      </div>
      <div role="separator" className="shell-menu-sep" />
      <button
        type="button"
        aria-pressed={up}
        onClick={() => {
          onDone()
          control?.hand?.set(!up)
        }}
        className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-ui font-medium text-ink outline-none transition-colors duration-[140ms] hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand max-sm:h-11"
      >
        <span aria-hidden="true" className="text-base leading-none">
          ✋
        </span>
        {up ? "Lower hand" : "Raise hand"}
      </button>
      <HandQueue docId={hereKey} busKey={hereKey} divider="before" />
    </>
  )
}
