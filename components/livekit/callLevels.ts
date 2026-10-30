/**
 * The arithmetic of a call's sound (hub.md C2, C6), kept pure so it is tested
 * without a room or a microphone.
 *
 * Levels are LiveKit's audioLevel, 0 to 1, where speech mostly sits between
 * 0.02 and 0.4. Everything here is smoothed, so a meter or a ring follows a
 * voice rather than every sample, and binary under reduced motion: speaking
 * or not.
 */

/** Below this a participant is not speaking. */
export const SPEAKING_THRESHOLD = 0.04
/** At or above this the ring is at full strength. */
const LOUD = 0.35
/** How long the ring stays after the voice drops below the threshold (ms). */
export const RING_HOLD_MS = 300

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/**
 * A level sampled many times a second (the green room's microphone), for the
 * few parts that draw it to listen to: the screen around them doesn't draw
 * again with every sample. Every sample is told, an unchanged one too: a
 * meter's smoothing moves on each.
 */
export interface LevelSource {
  read(): number
  listen(onSample: () => void): () => void
}

export function levelSource(): LevelSource & { write(level: number): void } {
  let level = 0
  const listeners = new Set<() => void>()
  return {
    read: () => level,
    write(next) {
      level = next
      for (const listener of listeners) listener()
    },
    listen(onSample) {
      listeners.add(onSample)
      return () => void listeners.delete(onSample)
    },
  }
}

/**
 * The 5-bar mic meter: how many bars to light, from a level and the previous
 * smoothed level. Speech is quiet on a linear scale, so the level is read on a
 * square root, which lights a bar or two for normal speech and all five when
 * shouting. Returns the bars and the new smoothed level to pass back next time.
 */
export function levelToBars(level: number, prev = 0): { bars: number; level: number } {
  const raw = clamp(Number.isFinite(level) ? level : 0, 0, 1)
  // Up fast, down slower: a voice's attack shows at once, its tail eases off.
  const smoothed = raw > prev ? prev + (raw - prev) * 0.6 : prev + (raw - prev) * 0.3
  const bars = clamp(Math.round(Math.sqrt(smoothed) * 6.5), 0, 5)
  return { bars: smoothed < 0.002 ? 0 : bars, level: smoothed }
}

export interface RingState {
  opacity: number
  /** When the voice was last above the threshold (ms), for the hold. */
  lastLoudAt: number
}

export const RING_OFF: RingState = { opacity: 0, lastLoudAt: -Infinity }

/**
 * The speaking ring's opacity: 0 when silent, .45 at the threshold up to 1 when
 * loud, smoothed toward its target, and held for RING_HOLD_MS after the voice
 * drops so the ring does not flicker between words. Reduced motion: 0 or 1.
 */
export function ringOpacity(level: number, prev: RingState = RING_OFF, { now = Date.now(), reduced = false }: { now?: number; reduced?: boolean } = {}): RingState {
  const l = clamp(Number.isFinite(level) ? level : 0, 0, 1)
  const speaking = l >= SPEAKING_THRESHOLD
  const lastLoudAt = speaking ? now : prev.lastLoudAt
  const held = !speaking && now - prev.lastLoudAt < RING_HOLD_MS
  if (reduced) return { opacity: speaking || held ? 1 : 0, lastLoudAt }
  if (!speaking && !held) return { opacity: 0, lastLoudAt }
  const target = speaking ? 0.45 + 0.55 * clamp((l - SPEAKING_THRESHOLD) / (LOUD - SPEAKING_THRESHOLD), 0, 1) : Math.max(0.45, prev.opacity * 0.8)
  const opacity = prev.opacity === 0 ? target : prev.opacity + (target - prev.opacity) * 0.5
  return { opacity: Math.round(clamp(opacity, 0.45, 1) * 1000) / 1000, lastLoudAt }
}

/** "24:10", or "1:02:03" past the hour: a call's elapsed time. */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const two = (n: number) => String(n).padStart(2, "0")
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`
}

/** A guest's LiveKit name is "Guest: Priya"; the plate says "Priya" with a Guest tag. */
export function guestName(identity: string, name: string): { name: string; guest: boolean } {
  const guest = identity.startsWith("guest-")
  return { name: guest ? name.replace(/^Guest:\s*/, "") || "Guest" : name, guest }
}

/** A guest's name as a board's people see it, "Priya (guest)", from their call identity and name. Pure. */
export function asGuest(identity: string, name: string): string {
  return `${guestName(identity, name).name} (guest)`
}
