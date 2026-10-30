// "Join as Kai Lin" at a guest link (calls HU13) goes to the member door in
// the app, which joins at once with the choices made at the link: no second
// green room. The choice is kept in this tab only (sessionStorage), for a
// minute, for that door's path alone, and taken once. Nothing in an address
// can make it, so a link someone sends never joins anybody to a call.

const KEY = "onecamp:door-join"
const FRESH_MS = 60_000

/** The microphone and camera, as chosen in the green room. */
export type DoorChoice = { audioEnabled: boolean; videoEnabled: boolean }

/** Keeps the join chosen at a guest link for the door at path, in this tab. */
export function keepDoorJoin(path: string, choice: DoorChoice, now = Date.now()): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ path, at: now, audioEnabled: choice.audioEnabled, videoEnabled: choice.videoEnabled }))
  } catch {
    /* storage off: the door shows its green room */
  }
}

/** What this tab kept, as it was kept. */
type Kept = { path?: unknown; at?: unknown; audioEnabled?: unknown; videoEnabled?: unknown }

function kept(): Kept | null | undefined {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (raw === null) return undefined
    try {
      return JSON.parse(raw) as Kept
    } catch {
      return null
    }
  } catch {
    return undefined // storage off
  }
}

/** The choice kept for the door at path, while fresh and readable; null otherwise. Pure. */
function choiceFor(k: Kept | null | undefined, path: string, now: number): DoorChoice | null {
  if (!k || k.path !== path || typeof k.at !== "number" || now < k.at || now - k.at > FRESH_MS) return null
  if (typeof k.audioEnabled !== "boolean" || typeof k.videoEnabled !== "boolean") return null
  return { audioEnabled: k.audioEnabled, videoEnabled: k.videoEnabled }
}

/**
 * The join chosen for the door at path a moment ago in this tab, left where it
 * is: what the door's first render reads (React may run that twice), before
 * an effect takes it.
 */
export function peekDoorJoin(path: string, now = Date.now()): DoorChoice | null {
  return choiceFor(kept(), path, now)
}

/**
 * The join chosen for the door at path a moment ago in this tab, taken once;
 * null otherwise. Another door's fresh choice stays for that door; a stale
 * one, or one that can't be read, is dropped.
 */
export function takeDoorJoin(path: string, now = Date.now()): DoorChoice | null {
  const k = kept()
  if (k === undefined) return null
  if (k && k.path !== path && typeof k.at === "number" && now - k.at <= FRESH_MS) return null
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* storage off */
  }
  return choiceFor(k, path, now)
}
