"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { Orbit, Rings } from "@/components/ui/graphics"
import type { CampHue } from "@/lib/campHue"

/**
 * Home's greeting, on the theme's wash: the one band on the screen (the
 * playful layer allows one per screen). The wash is the frame's tint, so the
 * greeting reads as the frame reaching into the page, and it follows the
 * colour theme a person picks.
 *
 * At its edge, the page's one motif, decorative: an orbit whose dots are the
 * person's own channels in their colours (`hues`), or quiet rings when they
 * have none yet.
 */
export function GreetingBand({ children, className, hues }: { children: ReactNode; className?: string; hues?: CampHue[] }) {
  return (
    <section aria-label="Your day" className={cn("relative overflow-hidden rounded-xl bg-brand-wash px-5 py-5 md:px-7 md:py-6", className)}>
      <div className="relative z-[1]">{children}</div>
      <div aria-hidden="true" data-greeting-motif="" className="pointer-events-none absolute -right-6 -top-8 hidden text-muted-foreground/60 sm:block">
        {hues && hues.length > 0 ? <Orbit size={168} dots={hues.length} hues={hues} /> : <Rings size={168} count={3} />}
      </div>
    </section>
  )
}
