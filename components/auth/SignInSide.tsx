"use client"

import { CampCanvas, CampHero, useHost } from "@/components/auth/CampArt"

/**
 * Beside the sign-in form, from 1024px up (design v3, admin.md F1, mock M10):
 * the camp canvas as an inset r24 panel, with the gradient logo ring, three
 * orbits turning slowly, five anonymous people and an agent on them, and two
 * chips that say real things about this server. The glow is the theme's own
 * (--glow, from the theme the person last chose), so a blue-theme person sees
 * a blue camp. It replaced a grey diagram on a muted half-page that was a
 * black void in dark mode.
 */
export function SignInSide() {
  const host = useHost()
  return (
    <CampCanvas panel>
      <CampHero host={host} />
    </CampCanvas>
  )
}
