// When to suggest installing OneCamp to the home screen.
//
// The prompt used to assume the app was installed whenever the browser's
// install event had not fired within half a second, and offered "Open App".
// iOS Safari never fires that event and Chrome fires it late, so nearly every
// phone visitor was told to open an app they did not have, on their first
// page, over the bottom navigation.
//
// Now it asks only when it can do something: install where the browser
// offers it, and Add to Home Screen steps on iOS. Never in the demo (the
// visitor is judging the product, not moving in), never on a first visit,
// and not again for a fortnight once dismissed.

export type PwaPromptKind = "install" | "instructions" | null

export interface PwaPromptEnv {
  mobile: boolean
  ios: boolean
  standalone: boolean
  demo: boolean
  /** The browser handed us an install prompt (beforeinstallprompt). */
  canPrompt: boolean
  /** When the prompt was last dismissed, ms since epoch. */
  dismissedAt: number | null
  /** How many separate visits this browser has made. */
  visits: number
  now: number
}

export const PWA_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000
export const PWA_MIN_VISITS = 2

export function pwaPromptKind(e: PwaPromptEnv): PwaPromptKind {
  if (!e.mobile || e.standalone || e.demo) return null
  if (e.dismissedAt !== null && e.now - e.dismissedAt < PWA_SNOOZE_MS) return null
  if (e.visits < PWA_MIN_VISITS) return null
  if (e.canPrompt) return "install"
  if (e.ios) return "instructions"
  return null
}
