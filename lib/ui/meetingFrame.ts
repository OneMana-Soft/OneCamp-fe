import { useState } from "react"

/**
 * Whether the shell draws the phone's frame (useMedia's isMobile), held while
 * a call's page is open.
 *
 * The shell draws a call's page in the phone's frame under 640px and in the
 * call's own frame above it. Crossing that line during a call (a window
 * resized, a phone or a tablet turned) gave the page a new parent, so React
 * mounted it anew, the call's room went with the old one, and the person was
 * back in the green room (27 Oct 2026). A call's page now keeps the frame it
 * opened in until it is left; the call still fits the new width, since its
 * stage reads its own container.
 *
 * Nothing is held before the width is known: useMedia's first render says
 * neither phone nor computer.
 */
export function useMeetingFrame(media: { isMobile: boolean; isDesktop: boolean }, inMeeting: boolean): boolean {
  const known = media.isMobile || media.isDesktop
  const [held, setHeld] = useState<boolean | null>(null)
  const next = inMeeting && known ? (held ?? media.isMobile) : null
  // React's own pattern for state that follows a render's input: set while
  // rendering, only when it changes.
  if (next !== held) setHeld(next)
  return next ?? media.isMobile
}
