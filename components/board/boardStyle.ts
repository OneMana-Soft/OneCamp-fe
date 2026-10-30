"use client"

import * as React from "react"
import type { Doc } from "yjs"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import type { BoardStyle } from "@/lib/board/notes"
import { useSceneReady } from "@/hooks/useSceneReady"

/** Writes a board setting for everyone, unless it's there already: a write of what's there would still go to everyone. */
export function writeBoardMeta(provider: HocuspocusProvider | null, key: string, value: unknown): void {
  const doc = provider?.document
  const meta = doc?.getMap<unknown>("boardMeta")
  if (!doc || !meta || meta.get(key) === value) return
  doc.transact(() => meta.set(key, value))
}

/**
 * A setting kept with the board, in its document's "boardMeta" map, so everyone
 * has it: read once synced and again on every change to the map, and written
 * for everyone. read turns what's stored (anything, or nothing yet) into the
 * setting, and may read the whole document (a tag's colour is a key of its
 * own: components/board/tagHues); it is a module function, so its identity
 * holds.
 */
export function useBoardMeta<T>(
  provider: HocuspocusProvider | null,
  synced: boolean,
  key: string,
  read: (stored: unknown, doc: Doc) => T,
): [T | null, (value: T) => void] {
  const meta = React.useMemo(() => provider?.document.getMap<unknown>("boardMeta") ?? null, [provider])
  const [value, setValue] = React.useState<T | null>(null)
  React.useEffect(() => {
    if (!synced || !meta || !provider) return
    const update = () => setValue(read(meta.get(key), provider.document))
    update()
    meta.observe(update)
    return () => meta.unobserve(update)
  }, [meta, provider, synced, key, read])
  const write = React.useCallback((v: T) => writeBoardMeta(provider, key, v), [provider, key])
  return [value, write]
}

/** One that never said is clean if it opened empty (a new board) and hand-drawn otherwise, as it has always been drawn. */
const readStyle = (stored: unknown, doc: Doc): BoardStyle =>
  stored === "clean" || stored === "sketch" ? stored : doc.getMap("elements").size === 0 ? "clean" : "sketch"

/** A board's style (owner, 21 Oct, O4), kept with the board so everyone draws in it. */
export function useBoardStyle(provider: HocuspocusProvider | null, synced: boolean): [BoardStyle | null, (s: BoardStyle) => void] {
  return useBoardMeta(provider, synced, "style", readStyle)
}

const readGrid = (stored: unknown): boolean => stored === true

/** Excalidraw's own switches that a board keeps elsewhere: the grid (Ctrl+') and snapping to shapes (Alt+S). */
type CanvasSwitch = "gridModeEnabled" | "objectsSnapModeEnabled"

interface SwitchCanvas {
  getAppState(): { isLoading: boolean } & Record<CanvasSwitch, boolean>
  /** Excalidraw's own signature: the switches named, and only those. */
  updateScene<K extends CanvasSwitch>(scene: { appState: Pick<Record<CanvasSwitch, boolean>, K> }): void
  onChange(listener: (elements: readonly unknown[], appState: Record<CanvasSwitch, boolean>) => void): () => void
}

/**
 * Keeps one of Excalidraw's switches in step with a setting kept elsewhere
 * (the board's, or the person's): put on the canvas once Excalidraw has loaded
 * its own scene, whose load would otherwise reset it, and again on every
 * change. Excalidraw's own key for it goes to toggled, and goes back on the
 * canvas when toggled refuses it (false). null: not known yet.
 */
function useCanvasSwitch<K extends CanvasSwitch>(api: SwitchCanvas | null, key: K, value: boolean | null, toggled: (on: boolean) => boolean): void {
  const ready = useSceneReady(api)
  React.useEffect(() => {
    if (!api || !ready || value === null) return
    if (api.getAppState()[key] !== value) api.updateScene({ appState: { [key]: value } as Record<K, boolean> })
    return api.onChange((_elements, appState) => {
      if (appState[key] === value) return
      if (!toggled(appState[key])) api.updateScene({ appState: { [key]: value } as Record<K, boolean> })
    })
  }, [api, ready, key, value, toggled])
}

/**
 * The board's grid (miro-02 1), kept with the board like its style, so it is
 * on for everyone on it. Excalidraw's own toggle (Ctrl+') sets it for
 * everyone, or, for someone who can't edit the board, goes back to the board's.
 */
export function useBoardGrid(
  api: SwitchCanvas | null,
  provider: HocuspocusProvider | null,
  synced: boolean,
  editable: boolean,
): [boolean | null, (on: boolean) => void] {
  const [grid, setGrid] = useBoardMeta(provider, synced, "grid", readGrid)
  const toggled = React.useCallback((on: boolean) => {
    if (editable) setGrid(on)
    return editable
  }, [editable, setGrid])
  useCanvasSwitch(api, "gridModeEnabled", grid, toggled)
  return [grid, setGrid]
}

const SNAP_KEY = "onecamp:board:snap"

/**
 * Snapping to shapes (miro-02 3): a moved or drawn shape lines up with the
 * edges and centres of the shapes and frames near it, and with equal gaps
 * between them, as Excalidraw draws its guides. The person's own choice, on
 * until they turn it off, kept in this browser like a note's colour; Excalidraw's
 * own key (Alt+S) sets it too.
 */
export function useBoardSnap(api: SwitchCanvas | null): [boolean, (on: boolean) => void] {
  const [snap, setSnapState] = React.useState(() => {
    try {
      return localStorage.getItem(SNAP_KEY) !== "off"
    } catch {
      return true
    }
  })
  const setSnap = React.useCallback((on: boolean) => {
    setSnapState(on)
    try {
      localStorage.setItem(SNAP_KEY, on ? "on" : "off")
    } catch {
      // A browser that keeps nothing still snaps as chosen until the board closes.
    }
  }, [])
  const toggled = React.useCallback((on: boolean) => {
    setSnap(on)
    return true
  }, [setSnap])
  useCanvasSwitch(api, "objectsSnapModeEnabled", snap, toggled)
  return [snap, setSnap]
}
