"use client"

import * as React from "react"
import { FileText } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { docIconOf } from "@/lib/docLook"

const Glyph = React.lazy(() => import("@/components/docEditor/chrome/glyphs"))

/**
 * A page's icon wherever a page is named (D-2; B6 owns it, B5, C1 and C2 use
 * it): its emoji, one of OneCamp's glyphs in its colour (loaded on first use),
 * or the page glyph in ink-3.
 */
export function DocIcon({ icon, size = 16, className }: { icon?: string | null; size?: number; className?: string }) {
  const of = docIconOf(icon)
  const box = { width: size, height: size }
  if (of && "emoji" in of)
    return (
      <span aria-hidden="true" data-doc-icon="emoji" className={cn("inline-flex shrink-0 items-center justify-center leading-none", className)} style={{ ...box, fontSize: Math.round(size * 0.875) }}>
        {of.emoji}
      </span>
    )
  if (!of) return <FileText aria-hidden="true" data-doc-icon="page" className={cn("shrink-0 text-ink-3", className)} style={box} />
  return (
    <React.Suspense fallback={<span aria-hidden="true" className={cn("inline-block shrink-0", className)} style={box} />}>
      <Glyph name={of.glyph} hue={of.hue} size={size} className={className} />
    </React.Suspense>
  )
}
