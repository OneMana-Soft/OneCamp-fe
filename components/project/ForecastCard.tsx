"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import type { ForecastHold } from "@/lib/work/forecast"
import { ForecastCardFrame, type ForecastCardProps } from "./ForecastCardFrame"

/** A late task's line is a link to its task. */
function taskLink(hold: ForecastHold, line: ReactNode) {
  return (
    <Link href={`/app/task/${hold.task_uuid}`} className="block text-ink underline-offset-2 hover:underline">
      {line}
    </Link>
  )
}

/**
 * What the forecast chip's card says (linear-20), in its words: the frame
 * (ForecastCardFrame) draws it, and each late task that holds the date up is
 * a link to its task. A chunk of its own, fetched on the chip's first press
 * (ForecastChip).
 */
export function ForecastCard(props: ForecastCardProps) {
  return <ForecastCardFrame {...props} task={taskLink} />
}
