"use client"

import * as React from "react"
import { FileText } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { docHue, docIconOf } from "@/lib/docLook"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { lazyPiece } from "@/lib/lazy/lazyPiece"

const Glyph = lazyPiece(() => import("@/components/docEditor/chrome/glyphs"))

/**
 * A page's icon wherever a page is named (D-2; B6 owns it, B5, C1 and C2 use
 * it): its emoji, or one of OneCamp's glyphs (loaded on first use) or the page
 * glyph, in the doc's hue (D13, lib/docLook docHue): the colour its owner gave
 * it, else its id's. Without an id or a colour the page glyph is ink-3.
 */
export function DocIcon({ icon, id, size = 16, className }: { icon?: string | null; id?: string | null; size?: number; className?: string }) {
  const of = docIconOf(icon)
  const box = { width: size, height: size }
  if (of && "emoji" in of)
    return (
      <span aria-hidden="true" data-doc-icon="emoji" className={cn("inline-flex shrink-0 items-center justify-center leading-none", className)} style={{ ...box, fontSize: Math.round(size * 0.875) }}>
        {of.emoji}
      </span>
    )
  const hue = docHue(id, icon)
  if (!of)
    return <FileText aria-hidden="true" data-doc-icon="page" data-hue={hue ?? undefined} className={cn("shrink-0", hue ? [HUE_CLASS[hue], "text-hue-ink"] : "text-ink-3", className)} style={box} />
  return (
    <React.Suspense fallback={<span aria-hidden="true" className={cn("inline-block shrink-0", className)} style={box} />}>
      <Glyph name={of.glyph} hue={of.hue ?? hue ?? undefined} size={size} className={className} />
    </React.Suspense>
  )
}
