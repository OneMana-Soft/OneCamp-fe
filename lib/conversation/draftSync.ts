import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { onSessionEnd } from "@/lib/sessionEnd"
import { toast } from "@/hooks/use-toast"
import type { RootState } from "@/store/store"
import type { UnknownAction } from "@reduxjs/toolkit"
import { DRAFT_SLOTS, type DraftSlot } from "@/lib/conversation/draftSlots"
import {
  draftKeyOf, draftPlaceOf, draftSignature, fromServerDraft, toServerDraft,
  type KeptDraft, type ServerDraft,
} from "@/lib/conversation/drafts"

/**
 * The Draft Store (chat P5; PROGRAM.md B24's drafts, D-M4): every composer's
 * draft, a channel's, a DM's, a group's and every thread's, kept beyond the
 * tab. On the device as it's typed (localStorage, the signed-in member's own,
 * let go at sign-out), so a reload, a crash or a deploy's chunk reload loses
 * nothing; and on the server a moment after typing stops (business/Draft), so
 * the same draft waits on another device and in another tab.
 *
 * It sits beside the composers rather than in them: it watches the store's
 * drafts (lib/conversation/draftSlots), so every composer, today's twelve
 * among them, is kept without knowing it.
 *
 * Which draft wins: one edited here and not yet on the server is never
 * replaced; otherwise the server's latest is put in the box, on opening the
 * app, coming back to the tab, coming back online and when another tab
 * writes. A draft the server no longer has (sent, or emptied elsewhere) leaves
 * a box that still shows what the server last had. Two devices editing one
 * draft at once: the last write wins.
 *
 * Loaded lazily by components/conversation/DraftSyncLoader, never in a page's
 * first load.
 */

/** How long typing rests before the draft goes to the server. */
export const SAVE_AFTER_MS = 1200
/** The least time between two readings of the server's drafts on returning to the tab. */
export const REFRESH_EVERY_MS = 15_000

/** A draft as the device keeps it: the draft, what it says, and whether the server has it. */
interface DeviceDraft {
  d: KeptDraft
  sig: string
  synced: boolean
}

/** The server's side, as the Draft Store reaches it. */
export interface DraftServer {
  list(): Promise<ServerDraft[]>
  put(body: Omit<ServerDraft, "updated_at">): Promise<unknown>
  remove(key: string): Promise<unknown>
}

/** What the Draft Store works on. */
export interface DraftSyncDeps {
  store: { getState(): RootState; subscribe(listener: () => void): () => void; dispatch(action: UnknownAction): unknown }
  /** The signed-in member's id: a DM's key needs it, and the device keeps drafts per member. */
  viewer: string
  server?: DraftServer
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null
  /** Told once of a draft the server won't keep (too long, too many), with its words. */
  onRefused?(key: string, words: string): void
}

const API: DraftServer = {
  list: async () => (await axiosInstance.get<{ data: { drafts: ServerDraft[] } }>("/drafts", OWN_ERRORS)).data.data.drafts ?? [],
  put: (body) => axiosInstance.put("/drafts", body, OWN_ERRORS),
  remove: (key) => axiosInstance.delete("/drafts", { ...OWN_ERRORS, params: { key } }),
}

/** The device's drafts for viewer: one key per member, so the next person on this browser never sees them. */
export const deviceKey = (viewer: string) => `onecamp-drafts:v1:${viewer}`

const statusOf = (err: unknown): number | undefined => (err as { response?: { status?: number } })?.response?.status
const wordsOf = (err: unknown): string | undefined => (err as { response?: { data?: { msg?: string } } })?.response?.data?.msg

function defaultStorage(): DraftSyncDeps["storage"] {
  try {
    return typeof window !== "undefined" ? window.localStorage : null
  } catch {
    return null
  }
}

/**
 * Starts keeping viewer's drafts for the store, and answers how to stop: the
 * device's are put in the empty boxes at once, then the server's.
 */
export function startDraftSync(deps: DraftSyncDeps): () => void {
  const { store, viewer } = deps
  const server = deps.server ?? API
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage
  const onRefused = deps.onRefused ?? ((_key, words) => toast({ title: "This draft is kept on this device only", description: words }))
  const key = deviceKey(viewer)

  const device: Record<string, DeviceDraft> = readDevice()
  // What each box said when last seen or filled here, by draft key: a change
  // to anything else is the person typing.
  const seen = new Map<string, string>()
  const maps = new Map<DraftSlot, Readonly<Record<string, unknown>> | undefined>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const sending = new Set<string>()
  const again = new Set<string>()
  // Keys the server refused for good (a place left, a draft too big): not
  // sent again until the draft changes.
  const refused = new Set<string>()
  let stopped = false
  // While a kept draft goes in its box: the actions it takes aren't typing.
  let filling = false
  let lastRefresh = 0
  let writeTimer: ReturnType<typeof setTimeout> | undefined

  function readDevice(): Record<string, DeviceDraft> {
    try {
      const raw = storage?.getItem(key)
      const parsed = raw ? JSON.parse(raw) : null
      return parsed && typeof parsed === "object" ? parsed : {}
    } catch {
      return {}
    }
  }
  function writeDevice() {
    if (writeTimer) clearTimeout(writeTimer)
    writeTimer = undefined
    try {
      let raw = JSON.stringify(device)
      // Over 1.5 MB, the ones the server has go first: they come back from it.
      if (raw.length > 1_500_000) {
        for (const k of Object.keys(device)) if (device[k].synced) delete device[k]
        raw = JSON.stringify(device)
      }
      storage?.setItem(key, raw)
    } catch {
      // A full or blocked store: the server still keeps them.
    }
  }
  const writeDeviceSoon = () => {
    if (!writeTimer) writeTimer = setTimeout(writeDevice, 250)
  }

  const slotOf = (place: string) => DRAFT_SLOTS.find((s) => s.place === place)
  /** What the box for draftKey holds now. */
  function current(draftKey: string): KeptDraft | null {
    const at = draftPlaceOf(draftKey, viewer)
    const slot = at && slotOf(at.place)
    const raw = slot?.drafts(store.getState())?.[at!.id]
    return slot && raw ? slot.read(raw) : null
  }
  /**
   * Puts d in draftKey's box in place of what it holds (null empties it), as
   * the box's own content: no save follows. The slice's actions go together;
   * what they leave is taken as seen.
   */
  function fill(draftKey: string, d: KeptDraft | null) {
    const at = draftPlaceOf(draftKey, viewer)
    const slot = at && slotOf(at.place)
    if (!slot) return
    filling = true
    try {
      const holds = slot.drafts(store.getState())?.[at!.id]
      for (const action of slot.restore(at!.id, d, holds)) store.dispatch(action)
    } finally {
      filling = false
    }
    const state = store.getState()
    for (const s of DRAFT_SLOTS) maps.set(s, s.drafts(state))
    seen.set(draftKey, draftSignature(current(draftKey)))
  }

  function schedule(draftKey: string, wait = SAVE_AFTER_MS) {
    const t = timers.get(draftKey)
    if (t) clearTimeout(t)
    timers.set(draftKey, setTimeout(() => void send(draftKey), wait))
  }

  async function send(draftKey: string) {
    timers.delete(draftKey)
    if (stopped) return
    if (sending.has(draftKey)) {
      again.add(draftKey)
      return
    }
    const entry = device[draftKey]
    if (!entry || entry.synced || refused.has(draftKey)) return
    sending.add(draftKey)
    try {
      if (entry.sig === "") await server.remove(draftKey)
      else await server.put(toServerDraft(draftKey, entry.d))
      const now = device[draftKey]
      if (now && now.sig === entry.sig) {
        if (now.sig === "") delete device[draftKey]
        else now.synced = true
        writeDevice()
      }
    } catch (err) {
      const status = statusOf(err)
      if (status === 429) schedule(draftKey, 60_000)
      else if (status === 400 || status === 404 || status === 409 || status === 413) {
        refused.add(draftKey)
        if (status === 409 || status === 413) onRefused(draftKey, wordsOf(err) ?? "It couldn't be kept on the server.")
      } else schedule(draftKey, 15_000)
    } finally {
      sending.delete(draftKey)
      if (again.delete(draftKey)) schedule(draftKey, 0)
    }
  }

  /** A box changed: keep what it says on the device now, and on the server soon. */
  function changed(draftKey: string, d: KeptDraft | null) {
    const sig = draftSignature(d)
    if (sig === (seen.get(draftKey) ?? "")) return
    seen.set(draftKey, sig)
    refused.delete(draftKey)
    const had = device[draftKey]
    if (sig === "" && (!had || (had.sig === "" && had.synced))) {
      delete device[draftKey]
    } else {
      device[draftKey] = { d: d ?? { html: "", files: [] }, sig, synced: false }
    }
    writeDeviceSoon()
    schedule(draftKey)
  }

  /** Every box the store changed since last looked. */
  function look() {
    if (stopped || filling) return
    const state = store.getState()
    for (const slot of DRAFT_SLOTS) {
      const now = slot.drafts(state)
      const was = maps.get(slot)
      if (now === was) continue
      maps.set(slot, now)
      const ids = new Set([...Object.keys(now ?? {}), ...Object.keys(was ?? {})])
      for (const id of ids) {
        const raw = now?.[id]
        if (raw === was?.[id]) continue
        const draftKey = draftKeyOf(slot.place, id, viewer)
        if (draftKey) changed(draftKey, raw ? slot.read(raw) : null)
      }
    }
  }

  /** The server's drafts, put in the boxes the person hasn't changed since. */
  async function refresh() {
    lastRefresh = Date.now()
    let drafts: ServerDraft[]
    try {
      drafts = await server.list()
    } catch {
      return // offline or failing: the device's stand, and the next return to the tab asks again
    }
    if (stopped) return
    const there = new Set<string>()
    for (const s of drafts) {
      there.add(s.key)
      const mine = device[s.key]
      if (mine && !mine.synced) continue // edited here, not yet on the server: it wins
      const d = fromServerDraft(s)
      const sig = draftSignature(d)
      const box = draftSignature(current(s.key))
      if (box === sig) {
        device[s.key] = { d, sig, synced: true }
        seen.set(s.key, sig)
        continue
      }
      // The box holds nothing, or what the server had before: the server's latest goes in.
      if (box === "" || box === (mine?.sig ?? seen.get(s.key) ?? "")) {
        device[s.key] = { d, sig, synced: true }
        fill(s.key, d)
      }
    }
    for (const [draftKey, mine] of Object.entries(device)) {
      if (there.has(draftKey) || !mine.synced) continue
      // Sent or emptied elsewhere: the box that still shows it empties.
      delete device[draftKey]
      if (draftSignature(current(draftKey)) === mine.sig) fill(draftKey, null)
    }
    writeDevice()
  }

  // The device's drafts go in their empty boxes at once, before any answer.
  for (const [draftKey, mine] of Object.entries(device)) {
    if (mine.sig === "") continue
    if (draftSignature(current(draftKey)) === "") fill(draftKey, mine.d)
    else seen.set(draftKey, mine.sig)
  }
  // What the boxes held before this started (typed while it loaded) is a change.
  for (const slot of DRAFT_SLOTS) maps.set(slot, undefined)
  look()
  // Then whatever this started with that isn't on the server yet goes to it.
  for (const [draftKey, mine] of Object.entries(device)) if (!mine.synced) schedule(draftKey)

  const unsubscribe = store.subscribe(look)
  void refresh()

  const onReturn = () => {
    if (document.visibilityState === "visible" && Date.now() - lastRefresh >= REFRESH_EVERY_MS) void refresh()
  }
  const onOnline = () => {
    for (const [draftKey, mine] of Object.entries(device)) if (!mine.synced) schedule(draftKey, 0)
    void refresh()
  }
  // Another tab of this app wrote its drafts: the boxes nobody changed here follow.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== key) return
    const theirs = readDevice()
    for (const [draftKey, entry] of Object.entries(theirs)) {
      const mine = device[draftKey]
      if (mine && !mine.synced) continue
      if (mine?.sig === entry.sig) continue
      const box = draftSignature(current(draftKey))
      if (box === "" || box === (seen.get(draftKey) ?? "")) {
        device[draftKey] = entry
        fill(draftKey, entry.sig === "" ? null : entry.d)
      }
    }
  }
  const flush = () => writeDevice()
  if (typeof window !== "undefined") {
    document.addEventListener("visibilitychange", onReturn)
    window.addEventListener("focus", onReturn)
    window.addEventListener("online", onOnline)
    window.addEventListener("storage", onStorage)
    window.addEventListener("pagehide", flush)
  }
  // Signing out lets go of them here (the server keeps them for next time).
  const forget = onSessionEnd(() => {
    stop()
    try {
      storage?.removeItem(key)
    } catch {
      // nothing kept
    }
  })

  function stop() {
    if (stopped) return
    stopped = true
    unsubscribe()
    forget()
    for (const t of timers.values()) clearTimeout(t)
    timers.clear()
    if (writeTimer) writeDevice()
    if (typeof window !== "undefined") {
      document.removeEventListener("visibilitychange", onReturn)
      window.removeEventListener("focus", onReturn)
      window.removeEventListener("online", onOnline)
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("pagehide", flush)
    }
  }
  return stop
}
