"use client"

import { Suspense, type ComponentProps } from "react"
import { lazyPiece } from "@/lib/lazy/lazyPiece"
import { cn } from "@/lib/utils/helpers/cn"
import type TaskTypeGlyph from "@/components/task/TaskTypeGlyph"

const Glyph = lazyPiece(() => import("@/components/task/TaskTypeGlyph"))

/**
 * A type's glyph on a first screen (a list's rows and headers, its toolbar):
 * the same TaskTypeGlyph, its code on demand, so no first load carries the
 * type icons (app/firstLoad's lazy list). Until it comes, an empty box its
 * size keeps the row from moving.
 */
export default function TypeGlyphOnDemand(props: ComponentProps<typeof TaskTypeGlyph>) {
  return (
    <Suspense fallback={<span aria-hidden="true" className={cn("inline-flex size-3.5 shrink-0", props.className)} />}>
      <Glyph {...props} />
    </Suspense>
  )
}
