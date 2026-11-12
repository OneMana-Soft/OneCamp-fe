// The ring's tone (slack-06 H2): one soft chime, again every CHIME_EVERY_MS
// until the ring stops. When to chime is pure (chimeTimes); the ring host
// plays it (playChime).

export const CHIME_EVERY_MS = 3000

export interface ChimeWhen {
  now: number
  until: number
  /** A silent ring (the chat is muted, or notifications are paused): no tone. */
  quiet: boolean
  /** Already in another call: one chime, never again. */
  inCall: boolean
  /** The person asked for less motion: one chime, never again. */
  reduced: boolean
}

/** When the ring chimes, in ms from now: at once, then every CHIME_EVERY_MS before until; once in a call or with reduced motion; never when quiet or over. Pure. */
export function chimeTimes(w: ChimeWhen): number[] {
  const left = w.until - w.now
  if (w.quiet || left <= 0) return []
  if (w.inCall || w.reduced) return [0]
  const out: number[] = []
  for (let at = 0; at < left; at += CHIME_EVERY_MS) out.push(at)
  return out
}

let audio: AudioContext | null = null

/** One soft chime: two quiet sine notes, never louder over time. Says nothing when the browser won't play it yet (its autoplay rules) or has no audio. */
export function playChime(): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    audio ??= new AC()
    const ctx = audio
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined)
    const t = ctx.currentTime
    ;[659.25, 880].forEach((hz, i) => {
      const at = t + i * 0.18
      const tone = ctx.createOscillator()
      const gain = ctx.createGain()
      tone.type = "sine"
      tone.frequency.value = hz
      gain.gain.setValueAtTime(0, at)
      gain.gain.linearRampToValueAtTime(0.06, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.6)
      tone.connect(gain).connect(ctx.destination)
      tone.start(at)
      tone.stop(at + 0.65)
    })
  } catch {
    // Refused (autoplay) or no audio: the card still shows.
  }
}
