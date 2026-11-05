"use client"

// Private mode on the board (miro-25), on demand through its gate (lib/board/privateMode): the round in the board's
// Yjs map "facilitation" (PRIVATE_KEY), and this tab's record of its author's held notes (lib/board/privateNotes),
// kept in this browser so a reload keeps the words. The canvas's frame sync writes through `writer` (veiled copies),
// follows the document through `inbound` (the author's words kept), and every other path that sends the scene
// anywhere reads `outward`. A canvas that took the shared copies before this code came gets its author's words back
// (restoreScene). When the round ends (or a tab opens after its round ended) this tab reveals the notes this browser
// holds: it bumps them on the canvas and writes them, words and all, reading the board's document for what to show,
// and clears only what it showed (V-497). A member's tabs share one record, each save merged into it (V-494). Storage
// can fail (a private window): the notes then live in this tab until the reveal.

import * as React from "react"
import type { Doc as YDoc } from "yjs"
import { LOCAL_ORIGIN, CAPTURE, type BoardElement, type SceneApi, type SharedElements } from "@/lib/board/binding"
import { storeWithMakers } from "@/lib/board/authors"
import { PrivateVeils } from "@/components/board/privateVeils"
import { useToast } from "@/hooks/use-toast"
import {
  PRIVATE_KEY,
  emptyPrivateNotes,
  parsePrivateNotes,
  privateNotesKey,
  privateRoundOf,
  privateScene,
  privateWriter,
  restoreScene,
  unveil,
  type PrivateNotes,
  type PrivateRound,
} from "@/lib/board/privateNotes"
import { mergePrivateNotes, revealScene, withoutHeld } from "@/lib/board/privateRecord"

type Who = { id: string; name: string }

function load(key: string): PrivateNotes | null {
  try {
    return parsePrivateNotes(window.localStorage.getItem(key))
  } catch {
    return null
  }
}

function save(key: string, notes: PrivateNotes | null): boolean {
  try {
    if (!notes || Object.keys(notes.publicText).length === 0) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, JSON.stringify(notes))
    return true
  } catch {
    return false
  }
}

/** This tab's record into the browser's, merged with what the member's other tabs keep there, never over it (V-494). */
const keep = (key: string, notes: PrivateNotes | null): boolean => !notes || save(key, mergePrivateNotes(notes, load(key)))

export interface PrivateNotesHandle {
  /** The running round, or null. */
  round: PrivateRound | null
  /** False when this browser can't keep the notes (they live in this tab until the reveal). */
  kept: boolean
  /** The frame sync's outbound copy, while a round runs; undefined otherwise. */
  writer(shared: Pick<SharedElements, "get">, scene: readonly BoardElement[]): ((el: BoardElement) => BoardElement) | undefined
  /** Each document copy as this tab takes it. */
  inbound(remote: BoardElement): BoardElement
  /** The scene as everyone else may see it (thumbnail, AI, templates). */
  outward<T extends BoardElement>(scene: readonly T[]): T[]
  /** Whether this tab keeps a held element's words: the author's own tab, where no veil goes over them. */
  holds(id: string): boolean
}

export interface PrivateNotesOptions {
  yDoc: YDoc
  boardId: string
  who: Who
  api: (SceneApi & { getSceneElementsIncludingDeleted(): readonly unknown[] }) | null
  yElements: SharedElements
  yAuthors: { has(id: string): boolean; set(id: string, v: unknown): unknown }
  ready: boolean
}

export function usePrivateNotes(opts: PrivateNotesOptions): PrivateNotesHandle {
  const { yDoc, boardId, who, api, yElements, yAuthors, ready } = opts
  const key = privateNotesKey(boardId, who.id)
  const facilitation = React.useMemo(() => yDoc.getMap<unknown>("facilitation"), [yDoc])
  const [round, setRound] = React.useState<PrivateRound | null>(() => privateRoundOf(facilitation.get(PRIVATE_KEY)))
  const [kept, setKept] = React.useState(true)
  const notesRef = React.useRef<PrivateNotes | null>(null)
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  // Read as this draws, not in an effect: the host hands the canvas its writer in a layout effect, before effects run.
  const loadedFor = React.useRef<string | null>(null)
  if (loadedFor.current !== key) {
    loadedFor.current = key
    notesRef.current = load(key)
  }

  React.useEffect(() => {
    const read = () => setRound(privateRoundOf(facilitation.get(PRIVATE_KEY)))
    read()
    facilitation.observe(read)
    return () => facilitation.unobserve(read)
  }, [facilitation])

  const persist = React.useCallback(() => {
    if (saveTimer.current) return
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      setKept(keep(key, notesRef.current))
    }, 400)
  }, [key])
  React.useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
  }, [])

  // Once the board is on the canvas: the author's words back on the shared copies it took while this code came.
  const restored = React.useRef(false)
  React.useEffect(() => {
    const notes = notesRef.current
    if (!api || !ready || restored.current) return
    restored.current = true
    if (!notes || round?.id !== notes.round) return
    const { elements, restored: n } = restoreScene(api.getSceneElementsIncludingDeleted() as BoardElement[], notes)
    if (n > 0) api.updateScene({ elements: elements as never, captureUpdate: CAPTURE.NEVER })
  }, [api, ready, round])

  // The reveal, once the board's document has synced: the notes this browser holds from a round that isn't running
  // any more, this tab's and what the member's other tabs kept (V-494). It reads the round from the map, not from
  // `round`, so a render that predates the round's sync never shows a running round's words. The record loses only
  // what the reveal settled, after the document has the words (V-497): a held word is never wiped unshown.
  React.useEffect(() => {
    if (!api || !ready) return
    const running = privateRoundOf(facilitation.get(PRIVATE_KEY))?.id
    const mine = notesRef.current && notesRef.current.round !== running ? notesRef.current : null
    const stored = load(key)
    const theirs = stored && stored.round !== running ? stored : null
    if (!mine && !theirs) return
    const notes = mine ? mergePrivateNotes(mine, theirs) : (theirs as PrivateNotes)
    const { elements, revealed } = revealScene(api.getSceneElementsIncludingDeleted() as BoardElement[], notes, yElements, who.id)
    if (revealed > 0) {
      api.updateScene({ elements: elements as never, captureUpdate: CAPTURE.NEVER })
      yDoc.transact(() => storeWithMakers(yAuthors, yElements, elements, who), LOCAL_ORIGIN)
    }
    const settled = Object.keys(notes.publicText)
    if (mine) notesRef.current = null
    if (stored) save(key, withoutHeld(stored, settled))
  }, [api, ready, round, key, facilitation, yDoc, yElements, yAuthors, who])

  // Storage can fail (a private window, a full disk): the notes then live in this tab only, so closing it before
  // the round ends loses their words. The author hears it once a round.
  const { toast } = useToast()
  const warned = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (kept || !round || warned.current === round.id) return
    warned.current = round.id
    toast({
      tone: "warning",
      title: "This browser can't keep your private notes",
      description: "They're in this tab only until the round ends. Keep it open, or what you wrote in private is lost.",
    })
  }, [kept, round, toast])

  return React.useMemo<PrivateNotesHandle>(() => {
    const writer: PrivateNotesHandle["writer"] = (shared, scene) => {
      // The map, not `round`: a round started or ended elsewhere counts from its first frame, before a render.
      const r = privateRoundOf(facilitation.get(PRIVATE_KEY))
      if (!r) return undefined
      // A record from a round whose reveal hasn't run yet stays held, into this round.
      const was = notesRef.current
      if (was?.round !== r.id) notesRef.current = was ? { ...was, round: r.id } : emptyPrivateNotes(r.id)
      const notes = notesRef.current as PrivateNotes
      let byId: Map<string, BoardElement> | null = null
      const find = (id: string) => (byId ??= new Map(scene.map((el) => [el.id, el]))).get(id)
      const write = privateWriter(notes, who, shared, find)
      return (el) => {
        const out = write(el)
        if (out !== el) persist()
        return out
      }
    }
    return {
      round,
      kept,
      writer,
      inbound(remote) {
        const notes = notesRef.current
        return notes ? unveil(notes, remote, notes.real[remote.id]) : remote
      },
      outward(scene) {
        // While a round runs, as the frame's next write would send it: a note made or edited since is held too.
        const write = writer(yElements, scene)
        return write ? (scene.map(write) as typeof scene[number][]) : privateScene(scene, notesRef.current, who)
      },
      // The record, not its real copies: a note edited in the round keeps no copy of its card.
      holds: (id) => !!notesRef.current && id in notesRef.current.publicText,
    }
  }, [round, kept, facilitation, who, persist, yElements])
}

/**
 * The canvas's private mode, drawn once its gate wants it: it hands the canvas its handle, and calls `onReady` when
 * it first does, so a frame write held while this code came goes out (veiled). It draws the veils of held notes whose
 * words aren't in this tab: others', and the member's own from another tab or device (V-488).
 */
export default function PrivateNotesHost({
  handleRef,
  onReady,
  ...opts
}: PrivateNotesOptions & { handleRef: { current: PrivateNotesHandle | null }; onReady: () => void }) {
  const handle = usePrivateNotes(opts)
  const ready = React.useRef(onReady)
  ready.current = onReady
  React.useLayoutEffect(() => {
    const first = !handleRef.current
    handleRef.current = handle
    if (first) ready.current()
  }, [handle, handleRef])
  React.useEffect(
    () => () => {
      handleRef.current = null
    },
    [handleRef],
  )
  return opts.api ? <PrivateVeils api={opts.api as never} me={opts.who.id} running={!!handle.round} holds={handle.holds} /> : null
}
