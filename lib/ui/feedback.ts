/**
 * Haptics, done visually (design v3, mobile F3).
 *
 * The web cannot buzz on iOS, and Android Chrome can (navigator.vibrate). So
 * every moment a native app would tap the person's hand gets a visual
 * signature, paired with a short vibration where the platform has one. The
 * vocabulary is Apple's haptic types, so a designer can say "a selection tick
 * here" and mean one thing:
 *
 *   selection   tab change, segmented change, picker tick, detent snap:
 *               the target scales 1 -> 1.06 -> 1 (220ms spring)
 *   impact      long press fires, a drag picks up: the item lifts from .97
 *               to 1 (260ms spring)
 *   medium      a swipe crosses its full-swipe threshold: the action's icon
 *               pops 1 -> 1.18 -> 1 (220ms spring)
 *   success     done, sent, saved: 1 -> 1.12 -> 1 on its disc
 *   warning     send failed, a field refused: a 3px shake, three cycles in
 *               240ms
 *
 * Under prefers-reduced-motion the scale and the shake become a 160ms blink of
 * the element's opacity; the vibration stays, because it isn't motion on the
 * screen. Vibration also follows a setting (on by default), kept per device.
 *
 * Everything goes through feedback(); nothing else in the app may call
 * navigator.vibrate (feedback.test.ts holds that).
 */

export type FeedbackKind = "selection" | "impact" | "medium" | "success" | "warning"

interface Signature {
  /** The element's keyframes on transform alone (compositor only). */
  frames: Keyframe[]
  duration: number
  easing: string
  /** The Android vibration, in ms or a pattern. */
  vibrate: number | number[]
}

const SPRING = "cubic-bezier(0.3, 1.35, 0.5, 1)"
const OUT = "cubic-bezier(0.22, 1, 0.36, 1)"

/** The table, mobile.md F3. Pinned by feedback.test.ts. */
export const FEEDBACK: Record<FeedbackKind, Signature> = {
  selection: {
    frames: [{ transform: "scale(1)" }, { transform: "scale(1.06)" }, { transform: "scale(1)" }],
    duration: 220,
    easing: SPRING,
    vibrate: 8,
  },
  impact: {
    frames: [{ transform: "scale(0.97)" }, { transform: "scale(1)" }],
    duration: 260,
    easing: SPRING,
    vibrate: 12,
  },
  medium: {
    frames: [{ transform: "scale(1)" }, { transform: "scale(1.18)" }, { transform: "scale(1)" }],
    duration: 220,
    easing: SPRING,
    vibrate: 15,
  },
  success: {
    frames: [{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }],
    duration: 220,
    easing: SPRING,
    vibrate: [10, 40, 10],
  },
  warning: {
    frames: [0, -3, 3, -2, 2, 0].map((x) => ({ transform: `translateX(${x}px)` })),
    duration: 240,
    easing: OUT,
    vibrate: [30, 40, 30],
  },
}

/** Under reduced motion: the outline blinks instead (opacity only). */
export const REDUCED_FRAMES: Keyframe[] = [{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }]
export const REDUCED_MS = 160

/** Where the person's choice about vibration is kept (on unless they turned it off). */
export const VIBRATE_KEY = "onecamp-haptics"

export function vibrationOn(): boolean {
  try {
    return localStorage.getItem(VIBRATE_KEY) !== "off"
  } catch {
    return true
  }
}

export function setVibration(on: boolean): void {
  try {
    if (on) localStorage.removeItem(VIBRATE_KEY)
    else localStorage.setItem(VIBRATE_KEY, "off")
  } catch {
    // A private window: the default (on) holds.
  }
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/**
 * Plays a feedback moment: the visual signature on el (when given) and, on a
 * device that can, the vibration. Returns the animation, for a caller that
 * wants to wait on it.
 */
export function feedback(kind: FeedbackKind, el?: Element | null): Animation | undefined {
  const sig = FEEDBACK[kind]
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function" && vibrationOn()) {
    try {
      navigator.vibrate(sig.vibrate)
    } catch {
      // A browser that refuses without a user gesture: the visual still plays.
    }
  }
  if (!el || typeof (el as HTMLElement).animate !== "function") return undefined
  if (reducedMotion()) return el.animate(REDUCED_FRAMES, { duration: REDUCED_MS, easing: "linear" })
  return el.animate(sig.frames, { duration: sig.duration, easing: sig.easing })
}
