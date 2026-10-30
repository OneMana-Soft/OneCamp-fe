"use client"

/**
 * useProfileHover for a dense list's people (a project's assignee cells):
 * the same 450 ms rest opens the card, but the hover-intent code is loaded on
 * the first rest, not with the list. A project's first screen has a source
 * ceiling (app/firstLoad.test.ts), and the card is a pointer's extra.
 */
import { useMemo } from "react"
import { useDispatch } from "react-redux"
import { once } from "@/lib/lazy/once"

const load = once(() => import("@/lib/hub/profileHoverOpen"))

const noop = () => undefined
function useOptionalDispatch(): (action: unknown) => unknown {
  // As in useProfileHover: a person can show outside the store's Provider.
  try {
    return useDispatch() as (action: unknown) => unknown
  } catch {
    return noop
  }
}

export function useLazyProfileHover(userUUID: string | null | undefined) {
  const dispatch = useOptionalDispatch()
  return useMemo(() => {
    let inside = false
    return {
      onPointerEnter: (e: React.PointerEvent<HTMLElement>) => {
        if (!userUUID || e.pointerType === "touch") return
        const el = e.currentTarget
        inside = true
        void load().then((m) => {
          if (inside) m.restOnPerson(el, userUUID, dispatch)
        })
      },
      onPointerLeave: (e: React.PointerEvent<HTMLElement>) => {
        if (!userUUID || e.pointerType === "touch") return
        inside = false
        void load().then((m) => m.leavePerson())
      },
    }
  }, [dispatch, userUUID])
}
