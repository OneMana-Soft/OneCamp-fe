"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * Home's greeting, on the theme's wash: the one band on the screen (the
 * playful layer allows one per screen). The wash is the frame's tint, so the
 * greeting reads as the frame reaching into the page, and it follows the
 * colour theme a person picks.
 */
export function GreetingBand({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section aria-label="Your day" className={cn("relative overflow-hidden rounded-xl bg-brand-wash px-5 py-5 md:px-7 md:py-6", className)}>
      {children}
    </section>
  )
}
