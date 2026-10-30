"use client"

import * as React from "react"

import { LoadFailureState, type WayBack } from "@/components/ui/load-failure-state"
import { Skeleton } from "@/components/ui/skeleton"
import type { PublicSurface } from "@/components/public/MadeWithOneCamp"
import { cn } from "@/lib/utils/helpers/cn"

import { PaperCard, PublicFrame } from "./PublicFrame"

/** The product's site, for the one way out of a dead public link; none when it isn't configured. */
const HOME = process.env.NEXT_PUBLIC_PRODUCT_SITE || ""

/**
 * A public link that doesn't open (content.md D20, Gone): inside the frame,
 * on a paper card, said as every screen in the app says it (LoadFailureState):
 * "This form doesn't exist or was deleted", what to do, and the one way out,
 * to the product's site when the build names one. A page that didn't load
 * (kind "failed") says nothing is lost, with Try again.
 *
 * The guest links, the forms and the booking pages each drew their own: a
 * lone grey ring, with a gold top bar or with no frame at all (PTC-19).
 */
export function PublicGone({
  surface,
  noun = "link",
  detail = "Ask the person who sent it for a new one.",
  kind = "gone",
  onRetry,
  back,
  more,
  frame = true,
  credit,
}: {
  surface: PublicSurface
  /** What the link opened, in the visitor's words: "form", "booking page", "shared project". */
  noun?: string
  /** What to do about it. */
  detail?: string
  kind?: "gone" | "failed"
  onRetry?: () => void
  /** The way on, when there is a better one than the product's site (a 404: the workspace). */
  back?: WayBack
  /** Another way on after it: Sign in, or the app's search. */
  more?: React.ReactNode
  /**
   * In the public frame, on its paper card (default); without it inside the
   * app's own shell, where a signed-in 404 keeps the sidebar.
   */
  frame?: boolean
  /** PublicFrame's credit. */
  credit?: boolean
}) {
  const body = (
    <LoadFailureState
      kind={kind}
      noun={noun}
      goneDetail={detail}
      onRetry={onRetry}
      back={back ?? (HOME ? { label: "About OneCamp", href: HOME } : undefined)}
      more={more}
      headingLevel={1}
      className="pt-0"
    />
  )
  if (!frame) {
    return (
      <main id="main-content" data-public-gone="" className="flex h-full min-h-0 flex-1 flex-col items-center justify-center px-4 py-16">
        {body}
      </main>
    )
  }
  return (
    <PublicFrame surface={surface} credit={credit} mainClassName="px-4 pt-6 sm:pt-12">
      <PaperCard className="flex max-w-[520px] flex-col items-center rounded-[16px] px-6 py-6 text-center shadow-e1 sm:px-12" data-public-gone="">
        {body}
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
