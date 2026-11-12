"use client"

import * as React from "react"

import { needsNoCode, PillAction, PillFrame, ProblemWords, useShownProblem, type ConnectionProblem } from "@/components/docEditor/ConnectionPillFrame"
import { Loader2 } from "@/lib/icons"

/**
 * The live doc's connection, said quietly (content.md D13): a 32 px pill
 * toast centred 12 px under the header, instead of a full-width strip. It
 * appears only once a problem has lasted 2 s, so blips never show, and after
 * it resolves it says "Back online" for 1.5 s. On a phone (docked) a floating
 * pill would sit over the title and its cover tools, so it is a full-width
 * row under the header instead, in the page's flow: the page moves down by
 * its height while it shows, and nothing is covered. Its wait, frame and
 * offline words are ConnectionPillFrame's, which the doc loads with the page,
 * so that offline before this code is in, its stand-in says the same (V-667).
 * It is one frame whatever it says, so its live region (role=status) stays one
 * node and a screen reader says each change, "Back online" after "Offline"
 * too; a new region is often read late or not at all (CR-B32 F1).
 * "unavailable": the collaboration server could not read the doc and refused
 * to open it (it never serves one empty). The stored copy stays on screen,
 * read-only, and Retry asks again.
 * "stalled": signed in, but the doc hasn't come (the session's join
 * watchdog); Try again opens a new connection.
 * besideNotice: a save notice beside it (a doc with no header dot, D05:
 * DocSaveNotice) says what becomes of the work, so offline the pill names only
 * the connection; one surface per message (V-21, design review).
 */
export function ConnectionPill({
  problem,
  onRetry,
  docked = false,
  besideNotice = false,
  className,
  said,
}: {
  problem: ConnectionProblem
  onRetry?: () => void
  docked?: boolean
  besideNotice?: boolean
  className?: string
  /** Whether its stand-in is saying a problem (LazyConnectionPill): the pill goes on from there. */
  said?: React.RefObject<boolean>
}) {
  const shown = useShownProblem(problem, said)

  if (!shown) return null
  return (
    <PillFrame shown={shown} docked={docked} className={className}>
      {needsNoCode(shown) ? (
        <ProblemWords shown={shown} onRetry={onRetry} docked={docked} besideNotice={besideNotice} />
      ) : shown === "back" ? (
        <>
          <span aria-hidden="true" className="size-1.5 rounded-full bg-camp-moss" />
          Back online
        </>
      ) : (
        <>
          <Loader2 aria-hidden="true" className="size-3.5 animate-spin text-ink-3" />
          {shown === "stalled" ? "Still connecting…" : "Reconnecting…"}
          {shown === "stalled" && onRetry && <PillAction onClick={onRetry} docked={docked}>Try again</PillAction>}
        </>
      )}
    </PillFrame>
  )
}
