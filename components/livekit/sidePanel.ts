import { useCallback, useState } from "react"

/**
 * A panel beside the stage (People, Chat, Polls and Q&A): the whole screen on
 * a phone, and from @3xl a right column like the AI's panel (#131416, r14,
 * 12 px in from the stage's edges, clear of the dock).
 */
export const CALL_SIDE_PANEL =
  "hub-panel-in flex h-full w-full flex-col overflow-hidden bg-[#131416] text-foreground @3xl:my-3 @3xl:mr-3 @3xl:h-[calc(100%-24px-84px)] @3xl:w-[320px] @3xl:rounded-[14px] @3xl:shadow-e3 @7xl:h-[calc(100%-24px-100px)]"

/** A side panel's foot (Chat's and Q&A's composers): its last line clear of a phone's home indicator. */
export const CALL_PANEL_FOOT = "shrink-0 border-t border-white/[0.06] px-3 pt-2.5 pb-[max(12px,env(safe-area-inset-bottom))]"

/** A small action on a side panel's dark surface: a pill, 44 px tall under touch. */
export const CALL_PANEL_TOOL =
  "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[8px] bg-white/[0.06] px-2.5 text-ui-sm font-medium text-[#EEEEF0] transition-colors hover:bg-white/[0.10] active:bg-white/[0.14] focus-visible:outline-2 focus-visible:outline-brand [@media(pointer:coarse)]:h-11"

/**
 * What someone has half written in a side panel, by call and field, kept
 * while the panel is shut or the side column shows another (CHAT-LEAD-3):
 * the panel unmounts then. Gone with the page.
 */
const kept = new Map<string, unknown>()

/** A half-written value kept under key across the panel's unmounts; set back to empty, it's forgotten. */
export function useKeptDraft<T>(key: string, empty: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => (kept.has(key) ? (kept.get(key) as T) : empty))
  const set = useCallback(
    (next: T) => {
      setValue(next)
      if (Object.is(next, empty)) kept.delete(key)
      else kept.set(key, next)
    },
    [key, empty],
  )
  return [value, set]
}
