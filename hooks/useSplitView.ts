"use client"

import { useCallback, useEffect, useRef } from "react"
import { useDispatch, useSelector, useStore } from "react-redux"
import { usePathname, useRouter } from "next/navigation"
import type { RootState } from "@/store/store"
import { closeSplit, openInSplit, replacePane, setActive, setFocused, setSplit } from "@/store/slice/splitSlice"
import { MAIN, claims, hrefOfPane, isCallPane, isPaneList, paneFromHref, restorablePanes, splitShortcut, stepView, type Pane, type SplitAction } from "@/lib/split"

const KEY = "oc_split_panes"

/** Where a view's keyboard focus goes: its composer or editor, else the view itself. */
function focusView(view: number) {
  const el = document.querySelector<HTMLElement>(`[data-split-view="${view}"]`)
  if (!el) return
  const target = el.querySelector<HTMLElement>('[contenteditable="true"], textarea:not([disabled]), input:not([type="hidden"]):not([disabled])')
  ;(target ?? el).focus({ preventScroll: true })
}

/**
 * Every split-view action, for the shortcuts, the panes' buttons and the
 * command palette alike. `view` is the view acted on (default: the active one).
 */
export function useSplitActions() {
  const dispatch = useDispatch()
  const store = useStore<RootState>()
  const router = useRouter()
  const pathname = usePathname()

  return useCallback(
    (action: SplitAction, view?: number) => {
      const { panes, active, focused } = store.getState().split
      const on = view ?? active
      switch (action.type) {
        case "openHere": {
          const pane = paneFromHref(window.location.pathname + window.location.search, window.location.origin)
          // A call page stays put: moving the call would hang it up.
          if (pane && !isCallPane(pane)) dispatch(openInSplit(pane))
          return
        }
        case "goTo":
        case "step": {
          const to = action.type === "goTo" ? action.view : stepView(active, action.by, panes.length)
          if (to !== MAIN && to >= panes.length) return
          dispatch(setActive(to))
          if (focused !== null) dispatch(setFocused(to))
          requestAnimationFrame(() => focusView(to))
          return
        }
        case "focus":
          dispatch(setFocused(focused === on ? null : on))
          return
        case "fullScreen": {
          if (document.fullscreenElement) {
            void document.exitFullscreen()
            dispatch(setFocused(null))
          } else {
            dispatch(setFocused(on))
            void document.documentElement.requestFullscreen?.().catch(() => {})
          }
          return
        }
        case "swap": {
          // The side view becomes the page; the page, if it can, goes beside.
          const pane = panes[on]
          const here = paneFromHref(pathname + window.location.search, window.location.origin)
          // A call stays where it is, beside or as the page: moving it would hang it up.
          if (on === MAIN || !pane || isCallPane(pane) || (here && isCallPane(here))) return
          if (here) dispatch(replacePane({ index: on, pane: here }))
          else dispatch(closeSplit(on))
          dispatch(setActive(MAIN))
          router.push(hrefOfPane(pane))
          return
        }
        case "close":
          if (on !== MAIN) dispatch(closeSplit(on))
          return
      }
    },
    [dispatch, store, router, pathname],
  )
}

/**
 * Opens something beside the page on a plain click (the call buttons do this,
 * so a call runs beside the conversation). Returns false, leaving the click
 * alone, for a modified click (a new tab) or on a phone, where the page opens
 * as before.
 */
export function useOpenBeside(enabled: boolean) {
  const dispatch = useDispatch()
  return useCallback(
    (pane: Pane, e?: { button?: number; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; preventDefault?: () => void }) => {
      if (!enabled || (e && ((e.button !== undefined && e.button !== 0) || e.metaKey || e.ctrlKey || e.shiftKey))) return false
      e?.preventDefault?.()
      dispatch(openInSplit(pane))
      return true
    },
    [enabled, dispatch],
  )
}

/**
 * Split view's wiring for the layout: panes remembered in this browser, the
 * active view following the pointer and the keyboard, the Ctrl+Alt shortcuts,
 * and Alt-click on a link to open it beside (Ctrl/Cmd-click still opens a
 * browser tab, as people expect).
 */
export function useSplitView(enabled: boolean) {
  const dispatch = useDispatch()
  const store = useStore<RootState>()
  const split = useSelector((s: RootState) => s.split)
  const run = useSplitActions()
  const restored = useRef(false)

  useEffect(() => {
    if (!enabled || restored.current) return
    restored.current = true
    try {
      const v: unknown = JSON.parse(localStorage.getItem(KEY) || "[]")
      if (isPaneList(v) && restorablePanes(v).length) dispatch(setSplit(restorablePanes(v)))
    } catch {
      /* nothing remembered */
    }
  }, [enabled, dispatch])

  useEffect(() => {
    if (!restored.current) return
    try {
      // A call is never restored: reloading must not put anyone back in it.
      localStorage.setItem(KEY, JSON.stringify(restorablePanes(split.panes)))
    } catch {
      /* storage unavailable: the split lasts the visit */
    }
  }, [split.panes])

  useEffect(() => {
    if (!enabled) return
    const onClick = (e: MouseEvent) => {
      if (!e.altKey || e.button !== 0 || e.metaKey || e.ctrlKey) return
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!a) return
      const pane = paneFromHref(a.getAttribute("href") || "", window.location.origin)
      if (!pane) return
      // Capture phase: before the link's own navigation.
      e.preventDefault()
      e.stopPropagation()
      dispatch(openInSplit(pane))
    }
    // The view under the pointer or holding the focus is the active one.
    const follow = (e: Event) => {
      const v = (e.target as Element | null)?.closest?.("[data-split-view]")?.getAttribute("data-split-view")
      if (v != null) dispatch(setActive(Number(v)))
    }
    const onKey = (e: KeyboardEvent) => {
      const action = splitShortcut({ code: e.code, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altGraph: e.getModifierState?.("AltGraph") })
      if (!action || !claims(action, store.getState().split.panes.length)) return
      // Taken before the editor sees it (capture phase), so a doc doesn't also
      // act on it.
      e.preventDefault()
      e.stopPropagation()
      run(action)
    }
    // Leaving browser full screen (Esc) ends the focus it started.
    const onFullScreen = () => {
      if (!document.fullscreenElement) dispatch(setFocused(null))
    }
    document.addEventListener("click", onClick, true)
    document.addEventListener("pointerdown", follow, true)
    document.addEventListener("focusin", follow, true)
    window.addEventListener("keydown", onKey, true)
    document.addEventListener("fullscreenchange", onFullScreen)
    return () => {
      document.removeEventListener("click", onClick, true)
      document.removeEventListener("pointerdown", follow, true)
      document.removeEventListener("focusin", follow, true)
      window.removeEventListener("keydown", onKey, true)
      document.removeEventListener("fullscreenchange", onFullScreen)
    }
  }, [enabled, dispatch, run, store])

  return split
}
