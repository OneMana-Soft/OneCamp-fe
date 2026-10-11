"use client"

/**
 * The profile card on hover (hub.md P1), for anything that shows a person:
 * spread the result on their avatar, name, mention or chip. 450ms on it opens
 * the card anchored to that element; leaving closes it after a 150ms grace;
 * Enter opens it from the keyboard. Clicking keeps doing what the caller did.
 */
import { useCallback, useMemo } from "react"
import { useDispatch } from "react-redux"

import { hoverEnter, hoverLeave, useHoverIntent, type HoverIntentProps } from "@/lib/hub/hoverIntent"
import { setLastAnchor } from "@/lib/hub/lastAnchor"
import { closeUI, openUI } from "@/store/slice/uiSlice"

/**
 * The store's dispatch, or one that does nothing where there is no store.
 * A person shows in places rendered outside the app's Provider (a report's
 * assignee chip in a test, an embed), and a hover card that cannot open must
 * not take the whole view down with it.
 */
const noop = () => undefined
function useOptionalDispatch(): (action: unknown) => unknown {
  // useDispatch reads one context and throws when there is no Provider; the
  // hook runs on every render either way, so catching keeps the order stable.
  try {
    return useDispatch() as (action: unknown) => unknown
  } catch {
    return noop
  }
}

export function useProfileHover(userUUID: string | null | undefined): HoverIntentProps {
  const dispatch = useOptionalDispatch()
  const open = useCallback(
    (el: HTMLElement) => {
      if (!userUUID) return
      setLastAnchor(el)
      dispatch(openUI({ key: "otherUserProfile", data: { userUUID } }))
    },
    [dispatch, userUUID],
  )
  const close = useCallback(() => dispatch(closeUI("otherUserProfile")), [dispatch])
  return useHoverIntent({ open, close, enabled: !!userUUID })
}

/**
 * The same for people inside a block of rendered text (a message's
 * @mentions), from one pair of handlers on the block: `uuidOf` reads the
 * person from the element under the pointer, or returns null for anything else.
 */
export function useProfileHoverWithin(selector: string, uuidOf: (el: HTMLElement) => string | null | undefined) {
  const dispatch = useOptionalDispatch()
  return useMemo(
    () => ({
      onPointerOver: (e: React.PointerEvent<HTMLElement>) => {
        if (e.pointerType === "touch") return
        const el = (e.target as HTMLElement).closest<HTMLElement>(selector)
        const from = (e.relatedTarget as HTMLElement | null)?.closest?.(selector)
        if (!el || from === el) return
        const userUUID = uuidOf(el)
        if (!userUUID) return
        hoverEnter(
          el,
          (anchor) => {
            setLastAnchor(anchor)
            dispatch(openUI({ key: "otherUserProfile", data: { userUUID } }))
          },
          () => dispatch(closeUI("otherUserProfile")),
        )
      },
      onPointerOut: (e: React.PointerEvent<HTMLElement>) => {
        if (e.pointerType === "touch") return
        const el = (e.target as HTMLElement).closest<HTMLElement>(selector)
        const to = (e.relatedTarget as HTMLElement | null)?.closest?.(selector)
        if (el && to !== el) hoverLeave()
      },
    }),
    [dispatch, selector, uuidOf],
  )
}
