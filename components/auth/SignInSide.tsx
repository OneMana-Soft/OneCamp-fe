"use client"

import { CampCanvas, useHost } from "@/components/auth/CampArt"
import { CampHero } from "@/components/auth/CampHeroes"
import { useHosting } from "@/lib/auth/useSignInFacts"

/** The camp's chip for where the workspace runs (SHELL-05). */
const SERVER = { self: "Your server", cloud: "OneMana Cloud", demo: "Demo server" }

/**
 * Beside the sign-in form, from 1024px up (design v3, admin.md F1, mock M10):
 * the camp canvas as an inset r24 panel, with the gradient logo ring, three
 * orbits turning slowly, five anonymous people and an agent on them, and two
 * chips that say real things about this server. The glow is the theme's own
 * (--glow, from the theme the person last chose), so a blue-theme person sees
 * a blue camp. Its chip's shield goes with the trust line's: none on the demo.
 */
export function SignInSide() {
  const host = useHost()
  const hosting = useHosting()
  return (
    <CampCanvas panel>
      <CampHero host={host} server={hosting ? SERVER[hosting] : undefined} shield={hosting !== "demo"} />
    </CampCanvas>
  )
}
