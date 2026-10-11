"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { SpotError } from "@/components/ui/graphics"
import { Skeleton } from "@/components/ui/skeleton"
import type { PublicSurface } from "@/components/public/MadeWithOneCamp"
import { cn } from "@/lib/utils/helpers/cn"

import { PaperCard, PublicFrame } from "./PublicFrame"

/** The product's site, for the one way out of a dead public link; none when it isn't configured. */
const HOME = process.env.NEXT_PUBLIC_PRODUCT_SITE || ""

/**
 * A public link that no longer works (content.md D20, Gone): inside the
 * frame, on a paper card, the error spot, what happened at 17/590 and what to
 * do at 14 ink-2. One ghost way out, no other buttons.
 */
export function PublicGone({
  surface,
  title = "This link has stopped working",
  detail = "Ask the person who sent it for a new one.",
}: {
  surface: PublicSurface
  title?: string
  detail?: string
}) {
  return (
    <PublicFrame surface={surface} mainClassName="px-4 pt-6 sm:pt-12">
      <PaperCard className="flex max-w-[520px] flex-col items-center rounded-[16px] px-6 py-12 text-center shadow-e1 sm:px-12" data-public-gone="">
        <SpotError size={96} />
        <h1 className="mt-4 text-title-3 text-ink">{title}</h1>
        <p className="mt-1.5 max-w-sm text-ui text-ink-2">{detail}</p>
        {HOME ? (
          <Button variant="ghost" size="sm" className="mt-5" asChild>
            <a href={HOME}>About OneCamp</a>
          </Button>
        ) : null}
      </PaperCard>
    </PublicFrame>
  )
}

/**
 * A public page opening (D20, Loading): the paper card in the doc's rhythm,
 * with one line saying what is opening, or why it is still trying.
 */
export function PublicPaperSkeleton({ label, className }: { label: string; className?: string }) {
  return (
    <PaperCard elevation="sheet" className={cn("max-w-[816px] px-5 py-8 sm:px-12 sm:py-14", className)} aria-busy="true">
      <p role="status" className="mb-6 text-ui-sm text-ink-3">
        {label}
      </p>
      <div aria-hidden="true" className="grid gap-3">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-5 h-3.5 w-full" />
        <Skeleton className="h-3.5 w-11/12" />
        <Skeleton className="h-3.5 w-4/5" />
        <Skeleton className="mt-5 h-5 w-1/3" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-3/4" />
      </div>
    </PaperCard>
  )
}
