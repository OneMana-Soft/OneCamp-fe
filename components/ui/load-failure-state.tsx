"use client"
import type * as React from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SpotError } from "@/components/ui/graphics/spots"
import { SpotShieldLock } from "@/components/auth/authSpots"
import { loadFailure, useSaysLoadFailure, type LoadFailure } from "@/lib/http/loadFailure"
import { cn } from "@/lib/utils/helpers/cn"

/** The way back from something that isn't on screen: a link, or a button (Close, in a panel). */
export type WayBack = { label: string; href: string } | { label: string; onClick: () => void }

/** What LoadFailureState is told: see LoadFailureState. */
export interface LoadFailureStateProps {
  /** The failed read's error; undefined when the answer had nothing in it. */
  error?: unknown
  /** Which of the three, when the screen already knows; otherwise read from error. */
  kind?: LoadFailure
  /** What the screen shows, in the person's words: "project", "task", "board", "table", "doc". */
  noun: string
  /** Reads it again (SWR's mutate for the key), for a failed read. */
  onRetry?: () => void
  retrying?: boolean
  /** Where to go instead: "Back to projects", or Close in a panel. */
  back?: WayBack
  /** The screen's Request access control, where the product has one; shown for no-access in place of the way back. */
  requestAccess?: React.ReactNode
  /** The no-access sentence, when the screen can say more about who to ask. */
  noAccessDetail?: React.ReactNode
  /** The gone sentence, when the screen can say more (a task hidden from its reader also answers as gone). */
  goneDetail?: React.ReactNode
  /** Another way on after the way back: the app's 404 searches for what the link named. */
  more?: React.ReactNode
  headingLevel?: 1 | 2 | 3 | 4
  className?: string
}

/**
 * What a screen draws in place of its one thing (a project, a task, a board,
 * a table, a doc) when reading it failed. One of three, from the read's error
 * (lib/http/loadFailure), each with a way on:
 *
 *   - no-access: "You can't see this project", with the screen's Request
 *     access where the product has one, else the way back;
 *   - gone: "This project doesn't exist or was deleted", with the way back;
 *   - failed: ErrorState's "Couldn't load this project": nothing has been
 *     lost, Try again.
 *
 * Nothing of the thing's own chrome is drawn around it: no title, no tabs, no
 * New task, which on a project nobody could see read as a live, empty one
 * (PTC-1). It says the failure in place, so the read's toast stays quiet.
 */
export function LoadFailureState({
  error,
  kind,
  noun,
  onRetry,
  retrying,
  back,
  requestAccess,
  noAccessDetail,
  goneDetail,
  more,
  headingLevel = 2,
  className,
}: LoadFailureStateProps) {
  const which = kind ?? loadFailure(error)
  // Said here, so the read's toast stays quiet (ErrorState says it for failed).
  useSaysLoadFailure(which !== "failed")
  if (which === "failed") {
    return (
      <div data-load-failure="failed" className={cn(FRAME, className)}>
        <ErrorState subject={`this ${noun}`} onRetry={onRetry} retrying={retrying} />
      </div>
    )
  }
  const way =
    back && more ? (
      <div className="flex flex-wrap items-center justify-center gap-2">
        <WayBackButton back={back} />
        {more}
      </div>
    ) : back ? (
      <WayBackButton back={back} />
    ) : (
      more
    )
  if (which === "no-access") {
    return (
      <div data-load-failure="no-access" className={cn(FRAME, className)}>
        <EmptyState
          illustration={<SpotShieldLock />}
          title={`You can't see this ${noun}`}
          description={noAccessDetail ?? "It hasn't been shared with you. Ask whoever sent you the link to give you access."}
          headingLevel={headingLevel}
          action={requestAccess ?? way}
        />
      </div>
    )
  }
  return (
    <div data-load-failure="gone" className={cn(FRAME, className)}>
      <EmptyState
        illustration={<SpotError />}
        title={`This ${noun} doesn't exist or was deleted`}
        description={goneDetail ?? "The link may be old or mistyped."}
        headingLevel={headingLevel}
        action={way}
      />
    </div>
  )
}

function WayBackButton({ back }: { back: WayBack }) {
  if ("href" in back) {
    return (
      <Button variant="outline" size="sm" asChild>
        <Link href={back.href}>{back.label}</Link>
      </Button>
    )
  }
  return (
    <Button variant="outline" size="sm" onClick={back.onClick}>
      {back.label}
    </Button>
  )
}

/** The frame every kind sits in: across the screen, near its top, as a table that isn't there reads. */
const FRAME = "flex w-full justify-center pt-8"
