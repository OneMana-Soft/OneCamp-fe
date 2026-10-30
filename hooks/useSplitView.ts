"use client"

import { useCallback, useEffect, useRef } from "react"
import { useDispatch, useSelector, useStore } from "react-redux"
import { usePathname } from "next/navigation"
import { useAppRouter } from "@/lib/navigation/appRouter"
import { injectSlice, type RootState } from "@/store/store"
import splitSlice, { type SplitState } from "@/store/slice/splitSlice"
import { closeSplit, evenOut, moveView, openInSplit, replacePane, restoreSplit, setActive, setFocused, setHere, setSplitOn } from "@/store/slice/splitActions"
import { focusView } from "@/hooks/useOpenBeside"
import { MAIN, MAIN_KEY, claims, hrefOfPane, isCallPane, keyOf, paneFromHref, restorablePanes, splitShortcut, type SplitAction } from "@/lib/split"
import { readSplit, stepView, viewRow } from "@/lib/splitLayout"

// Split view's state is the shell's, not the store's every page reaches.
injectSlice(splitSlice)

/** Split view's state (added above, so there for the shell and what it draws). */
export const selectSplit = (s: RootState) => s.split as SplitState

/** The layout, kept per tab and as a new tab's (P); the list kept before. */
const KEY = "oc_split_layout"
const OLD_KEY = "oc_split_panes"


/** A brand ring on a view's sheet, coming and going: here it is. */
function ring(key: string) {
  document.querySelector(`[data-split-sheet="${key}"]`)?.animate?.([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], { duration: 700, easing: "ease-out", pseudoElement: "::after" })
}

/**
 * Every split-view action, for the shortcuts, the panes' buttons and the
 * command palette alike. `view` is the view acted on (default: the active one).
 */
export function useSplitActions() {
  const dispatch = useDispatch()
  const store = useStore<RootState>()
  const router = useAppRouter()
  const pathname = usePathname()

  return useCallback(
    (action: SplitAction, view?: number) => {
      const { panes, order, active, focused } = selectSplit(store.getState())
      const on = view ?? active
      const row = viewRow(panes, order)
      switch (action.type) {
        case "openHere": {
          const pane = paneFromHref(window.location.pathname + window.location.search, window.location.origin)
          // A call page stays put: moving the call would hang it up.
          if (pane && !isCallPane(pane)) dispatch(openInSplit({ ...pane, pin: true }))
          return
        }
        case "goTo":
        case "nth":
        case "step": {
          const to = action.type === "goTo" ? action.view : action.type === "nth" ? row[action.at] : stepView(row, active, action.by)
          if (to === undefined || (to !== MAIN && to >= panes.length)) return
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
        case "move":
          dispatch(moveView({ view: on, by: action.by }))
          return
        case "even":
          dispatch(evenOut())
          return
        case "close":
          if (on === MAIN) return
          dispatch(closeSplit(on))
          // The keys, and the focus, go to the view now active.
          requestAnimationFrame(() => focusView(selectSplit(store.getState()).active))
          return
      }
    },
    [dispatch, store, router, pathname],
  )
}

/**
 * Split view's wiring for the layout: the layout kept per tab, the page's own
 * item (setHere), the active view following the pointer and the keyboard, the
 * Ctrl+Alt shortcuts, and Alt-click on a link to open it beside (Ctrl/Cmd-click
 * still opens a browser tab, as people expect).
 */
export function useSplitView(enabled: boolean) {
  const dispatch = useDispatch()
  const store = useStore<RootState>()
  const split = useSelector(selectSplit)
  const run = useSplitActions()
  const pathname = usePathname()
  const router = useAppRouter()
  const restored = useRef(false)

  useEffect(() => {
    dispatch(setSplitOn(enabled))
  }, [enabled, dispatch])

  useEffect(() => {
    dispatch(setHere(paneFromHref(pathname ?? "")))
  }, [pathname, dispatch])

  useEffect(() => {
    if (!enabled || restored.current) return
    restored.current = true
    try {
      const kept = readSplit(JSON.parse(sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY) || "null"))
      if (kept && restorablePanes(kept.panes).length) dispatch(restoreSplit({ ...kept, panes: restorablePanes(kept.panes) }))
    } catch {
      /* nothing remembered */
    }
  }, [enabled, dispatch])

  const { panes, order, sizes } = split
  useEffect(() => {
    if (!restored.current) return
    // A call is never kept: reloading must not put anyone back in it.
    const kept = restorablePanes(panes)
    const keys = [MAIN_KEY, ...kept.map((_, i) => keyOf(kept, i))]
    const value = JSON.stringify({ panes: kept, order: order.filter((k) => keys.includes(k)), sizes: Object.fromEntries(Object.entries(sizes).filter(([k]) => keys.includes(k))) })
    try {
      sessionStorage.setItem(KEY, value)
      localStorage.setItem(KEY, value)
      localStorage.removeItem(OLD_KEY)
    } catch {
      /* storage unavailable: the split lasts the visit */
    }
  }, [panes, order, sizes])

  // An item opened again while open: its view comes forward, takes the keys, and rings.
  const pulse = split.pulse
  useEffect(() => {
    if (!pulse) return
    const view = pulse.key === MAIN_KEY ? MAIN : selectSplit(store.getState()).panes.findIndex((p) => keyOf([p], 0) === pulse.key)
    requestAnimationFrame(() => {
      focusView(view)
      ring(pulse.key)
    })
  }, [pulse, store])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!e.altKey || e.button !== 0 || e.metaKey || e.ctrlKey) return
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!a) return
      const pane = paneFromHref(a.getAttribute("href") || "", window.location.origin)
      if (!pane) return
      // Capture phase: before the link's own navigation.
      e.preventDefault()
      e.stopPropagation()
      // Split off (a phone): the page, not the browser's Alt-click download.
      if (enabled) dispatch(openInSplit(pane))
      else router.push(a.pathname + a.search + a.hash)
    }
    document.addEventListener("click", onClick, true)
    if (!enabled) return () => document.removeEventListener("click", onClick, true)
    // The view under the pointer or holding the focus is the active one.
    const follow = (e: Event) => {
      const v = (e.target as Element | null)?.closest?.("[data-split-view]")?.getAttribute("data-split-view")
      if (v != null) dispatch(setActive(Number(v)))
    }
    const onKey = (e: KeyboardEvent) => {
      const action = splitShortcut({ code: e.code, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altGraph: e.getModifierState?.("AltGraph") })
      if (!action || !claims(action, selectSplit(store.getState()).panes.length)) return
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
  }, [enabled, dispatch, run, store, router])

  return split
}
