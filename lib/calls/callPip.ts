/**
 * A call's picture-in-picture (meet-14, as Meet's from its More menu): which
 * picture the small window shows while the call's tab is out of sight, and
 * the <video> a browser without a window of our own pops out instead.
 */
import type { PipSize } from "@/lib/pip/pipWindow"

/** The window's first size: one 16:9 picture over a row of controls (the browser takes it as a hint). */
export const CALL_PIP_SIZE: PipSize = { width: 400, height: 300 }

/** LiveKit's names for a camera and a shared screen, as a tile's key carries them. */
const CAMERA = "camera"
const SHARE = "screen_share"

/** A tile's key (`identity|source`, its data-flip-key) taken apart; a key with no source (a board's) has none. */
function tileOf(key: string): { key: string; identity: string; source: string } {
  const at = key.lastIndexOf("|")
  return at < 0 ? { key, identity: key, source: "" } : { key, identity: key.slice(0, at), source: key.slice(at + 1) }
}

/** Someone in the call, and when they last began to speak (LiveKit's lastSpokeAt). */
export type Spoke = { identity: string; lastSpokeAt?: Date }

/** Who spoke last, never you (you know what you said); null while no one else has. Pure. */
export function lastSpeaker(people: Iterable<Spoke>, you?: string): string | null {
  let last: { identity: string; at: number } | null = null
  for (const p of people) {
    const at = p.lastSpokeAt?.getTime()
    if (p.identity === you || at === undefined) continue
    if (!last || at > last.at) last = { identity: p.identity, at }
  }
  return last?.identity ?? null
}

/**
 * The pictures a call's picture-in-picture would show, best first, by their
 * tiles' keys (`identity|source`; shares oldest first, as the call has them):
 * the newest screen someone else shares (never yours, which would show the
 * window inside itself), then whoever spoke last, then everyone else in the
 * call's order, then you. The window shows the first. Pure.
 */
export function pipOrder(keys: readonly string[], o: { speaker?: string | null; you?: string } = {}): string[] {
  const tiles = keys.map(tileOf)
  const shares = tiles.filter((t) => t.source === SHARE && t.identity !== o.you).reverse()
  const speaker = o.speaker && o.speaker !== o.you ? o.speaker : null
  const rank = (t: { identity: string }) => (t.identity === speaker ? 0 : t.identity === o.you ? 2 : 1)
  // A stable sort: the call's order holds within each rank.
  const cameras = tiles.filter((t) => t.source === CAMERA).sort((a, b) => rank(a) - rank(b))
  return [...shares, ...cameras].map((t) => t.key)
}

/**
 * The <video> a browser with only a video's own picture-in-picture pops out
 * (Safari): the first stage tile in pipOrder whose picture plays (a camera
 * that's off has none). Null when no one's does.
 */
export function pipVideo(doc: Document, o: { speaker?: string | null; you?: string } = {}): HTMLVideoElement | null {
  const playing = new Map<string, HTMLVideoElement>()
  for (const tile of Array.from(doc.querySelectorAll<HTMLElement>("[data-flip-key]"))) {
    const key = tile.dataset.flipKey
    const video = tile.querySelector("video")
    if (key && video && video.readyState >= 1 && !playing.has(key)) playing.set(key, video)
  }
  const [first] = pipOrder([...playing.keys()], o)
  return first === undefined ? null : (playing.get(first) ?? null)
}
