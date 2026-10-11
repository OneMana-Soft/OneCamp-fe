/**
 * The frame's campfire glow crossfading to a new accent (design v3, admin D1:
 * "choosing an accent re-themes live: the campfire glow on the frame
 * crossfades to the new hue over 400ms, two stacked glow layers, opacity").
 *
 * The frame paints its glow from --glow and --glow2, which the accent's theme
 * class sets, so switching the class swaps the glow in one frame. Before it
 * switches, this lays a copy of the OLD glow over the frame's own (a layer at
 * z-index -1 inside the frame's isolated stack, so it sits under all content
 * and over the frame's ::before), then fades that copy out: the new glow shows
 * through as the old one goes. Opacity only. Under reduced motion, or with no
 * frame on screen (a test, the phone dialog), it just switches.
 */
export function crossfadeGlow(apply: () => void) {
  if (typeof window === "undefined" || typeof document === "undefined") return apply()
  const frame = document.querySelector<HTMLElement>(".app-frame")
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  if (!frame || still) return apply()
  const css = getComputedStyle(frame)
  const glow = css.getPropertyValue("--glow").trim()
  const glow2 = css.getPropertyValue("--glow2").trim()
  if (!glow) return apply()
  frame.querySelectorAll(":scope > [data-glow-was]").forEach((n) => n.remove())
  const was = document.createElement("div")
  was.setAttribute("data-glow-was", "")
  was.setAttribute("aria-hidden", "true")
  was.className = "you-glow-was"
  was.style.setProperty("--you-glow", glow)
  was.style.setProperty("--you-glow2", glow2 || glow)
  frame.appendChild(was)
  apply()
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      was.setAttribute("data-fading", "true")
      window.setTimeout(() => was.remove(), 460)
    }),
  )
}
