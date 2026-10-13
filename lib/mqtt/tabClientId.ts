/**
 * This tab's part of the live connection's client id.
 *
 * Kept in sessionStorage, so a reload of the tab resumes its session at the
 * broker (messages sent while it reloaded aren't lost). But a duplicated tab
 * copies sessionStorage, and with the same client id the two tabs took the
 * session from each other in turn (the broker drops the older connection),
 * each missing messages while the other held it. So a tab asks the other open
 * tabs whether the id it found is in use before it keeps it, and takes a new
 * one if it is.
 */

const KEY = "mqtt_tab_id"
const CHANNEL = "onecamp-mqtt-tab-id"

type Note = { kind: "asking" | "taken"; id: string; from: string }

/** This page's id, once settled. */
let mine: string | null = null
/** The id this page is about to take, answered for as if it were taken. */
let candidate: string | null = null
const self = Math.random().toString(36).slice(2)
let channel: BroadcastChannel | null = null

function fresh(): string {
  return Math.random().toString(36).slice(2, 8)
}

function open(): BroadcastChannel | null {
  if (channel || typeof BroadcastChannel === "undefined") return channel
  channel = new BroadcastChannel(CHANNEL)
  channel.onmessage = (event: MessageEvent<Note>) => {
    const note = event.data
    if (!note || note.from === self || note.kind !== "asking") return
    if (note.id === mine || note.id === candidate) {
      channel?.postMessage({ kind: "taken", id: note.id, from: self } satisfies Note)
    }
  }
  return channel
}

/** Whether another open tab answers that it has id, within waitMs. */
function inUse(id: string, waitMs: number): Promise<boolean> {
  const ch = open()
  if (!ch) return Promise.resolve(false)
  return new Promise((resolve) => {
    const answer = new BroadcastChannel(CHANNEL)
    const done = (taken: boolean) => {
      clearTimeout(timer)
      answer.close()
      resolve(taken)
    }
    answer.onmessage = (event: MessageEvent<Note>) => {
      const note = event.data
      if (note?.kind === "taken" && note.id === id && note.from !== self) done(true)
    }
    const timer = setTimeout(() => done(false), waitMs)
    ch.postMessage({ kind: "asking", id, from: self } satisfies Note)
  })
}

/** This tab's id: the one it had, unless another open tab has it too. */
export async function tabClientId(waitMs = 150): Promise<string> {
  if (mine) return mine
  if (typeof window === "undefined") return fresh()
  let id = ""
  try {
    id = sessionStorage.getItem(KEY) || ""
  } catch {
    id = ""
  }
  if (id) {
    candidate = id
    if (await inUse(id, waitMs)) id = ""
  }
  if (!id) {
    id = fresh()
    try {
      sessionStorage.setItem(KEY, id)
    } catch {
      // Private mode: an id for this page alone.
    }
  }
  mine = id
  candidate = null
  open()
  return id
}
