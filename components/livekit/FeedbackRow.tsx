"use client"

import { CALL_FEEDBACK, feedbackLabel, type CallFeedback } from "@/lib/calls/hands"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * The signs that stay beside your name until you press them again (D-CL-13):
 * Yes, No, Slow down, Away. Under the reactions in the React tray.
 */
export function FeedbackRow({ current, onSet, onDone }: { current: CallFeedback | null; onSet: (f: CallFeedback | null) => void; onDone: () => void }) {
  return (
    <div role="group" aria-label="Signs that stay" className="mt-1.5 flex gap-1 border-t border-white/[0.08] pt-1.5">
      {CALL_FEEDBACK.map((f) => {
        const on = current === f
        return (
          <button
            key={f}
            type="button"
            aria-pressed={on}
            onClick={() => {
              onSet(on ? null : f)
              onDone()
            }}
            className={cn(
              "h-9 rounded-[10px] px-2.5 text-ui font-medium text-[#EEEEF0] transition-colors duration-150 hover:bg-[#34353B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [@media(pointer:coarse)]:h-11",
              on && "bg-[#34353B] ring-1 ring-inset ring-white/20",
            )}
          >
            {feedbackLabel(f)}
          </button>
        )
      })}
    </div>
  )
}
