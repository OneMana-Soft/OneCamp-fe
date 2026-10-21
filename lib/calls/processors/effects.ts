// Media Processors (#55): what someone chose to look and sound like in a call,
// kept on their device. The words for each choice are in effectsCopy.ts,
// which loads with the picker. Everything here runs in the browser and nothing is
// sent anywhere: the background is cut out on this device (MediaPipe's selfie
// segmenter, served by this server), and noise is removed on this device
// (RNNoise). Pure, no LiveKit import; the processors that act on it load
// only when someone turns an effect on (background.ts, noise.ts).

/** The frame a backdrop or one's own picture is drawn at. */
export const BACKDROP_SIZE = { width: 1280, height: 720 } as const

/** A built-in backdrop, drawn in the camp palette (backdrops.ts). */
export type BackdropId = "moss" | "sun" | "lake" | "sky" | "dusk" | "berry"

/** The backdrops, in the order the picker shows them (their names: effectsCopy.ts). */
export const BACKDROP_IDS: readonly BackdropId[] = ["moss", "sun", "lake", "sky", "dusk", "berry"]

/** What is behind someone on camera. */
export type Background =
  | { kind: "none" }
  | { kind: "blur"; strength: "light" | "strong" }
  | { kind: "backdrop"; id: BackdropId }
  /** A picture of their own, kept on this device only. */
  | { kind: "picture" }

/**
 * How a microphone's sound is cleaned up.
 * - standard: the browser's own noise suppression (the default).
 * - strong: RNNoise on this device, for typing, traffic and fans.
 * - off: the sound as it is, for music.
 */
export type NoiseLevel = "standard" | "strong" | "off"

export interface CallEffects {
  background: Background
  noise: NoiseLevel
}

export const NO_EFFECTS: CallEffects = { background: { kind: "none" }, noise: "standard" }

/** A blur's radius in the segmenter's pixels: light keeps the room's shape, strong hides it. */
export const BLUR_RADIUS = { light: 6, strong: 18 } as const


const KNOWN_BACKDROPS = new Set<string>(BACKDROP_IDS)

/** A background read from anywhere (storage, a message), or none. Pure. */
export function readBackground(v: unknown): Background {
  const b = v as { kind?: unknown; strength?: unknown; id?: unknown } | null
  if (b?.kind === "blur" && (b.strength === "light" || b.strength === "strong")) return { kind: "blur", strength: b.strength }
  if (b?.kind === "backdrop" && typeof b.id === "string" && KNOWN_BACKDROPS.has(b.id)) return { kind: "backdrop", id: b.id as BackdropId }
  if (b?.kind === "picture") return { kind: "picture" }
  return { kind: "none" }
}

/** A noise level read from anywhere, or the standard one. Pure. */
export function readNoise(v: unknown): NoiseLevel {
  return v === "strong" || v === "off" ? v : "standard"
}

/** Whether two backgrounds are the same choice. Pure. */
export function sameBackground(a: Background, b: Background): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === "blur" && b.kind === "blur") return a.strength === b.strength
  if (a.kind === "backdrop" && b.kind === "backdrop") return a.id === b.id
  return true
}

const KEY = "onecamp.call.effects"

/**
 * The effects chosen last time, for the green room and the call that
 * follows. In localStorage, read in try/catch: a private window simply
 * starts with none. A picture of one's own is kept apart (picture.ts) and
 * is "none" when it has gone.
 */
export function readEffects(): CallEffects {
  try {
    const raw = window.localStorage.getItem(KEY)
    const v = raw ? (JSON.parse(raw) as { background?: unknown; noise?: unknown }) : null
    return { background: readBackground(v?.background), noise: readNoise(v?.noise) }
  } catch {
    return NO_EFFECTS
  }
}

export function writeEffects(e: CallEffects): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(e))
  } catch {
    /* none next time, then */
  }
}
