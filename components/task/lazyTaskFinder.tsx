"use client"

import type { ReactElement } from "react"
import { lazyView } from "@/lib/lazy/lazyView"
import { Combobox, ComboboxContent, ComboboxTrigger } from "@/components/ui/combobox"
import type { TaskInfoInterface } from "@/types/task"

const Finder = lazyView(() => import("@/components/task/taskFinder"))

/**
 * Starts loading the finder's rows: on its control's hover or focus, so they're
 * in by the press. lazyView's prefetch never throws: a load that fails is asked
 * for again when the menu opens, which says why if it still can't come.
 */
const warmTaskFinder = () => void Finder.prefetch()

interface PickTaskProps {
  /** With nothing typed, your open tasks due by this moment. */
  dueBy: Date
  /** The task picked, as the list read it; the menu closes. */
  onPick: (task: TaskInfoInterface) => void
  /** For a caller that keeps one of its pickers open at a time. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** The control that opens it, which keeps its own role and name. */
  children: ReactElement
}

/**
 * One of your tasks to pick (calendar B1: time for a task), opened by the
 * control it wraps: the combobox, a popover on a computer and a sheet on a
 * phone. The server searches, so the menu doesn't filter its rows again. The
 * rows are a chunk of their own (taskFinder): whatever offers it pays for them
 * once it's opened.
 */
export function PickTask({ dueBy, onPick, open, onOpenChange, children }: PickTaskProps) {
  return (
    <Combobox open={open} onOpenChange={onOpenChange}>
      <ComboboxTrigger asChild onPointerEnter={warmTaskFinder} onFocus={warmTaskFinder}>
        {children}
      </ComboboxTrigger>
      <ComboboxContent label="Your tasks" command={{ shouldFilter: false }} className="w-80" data-task-finder="">
        <Finder.View
          fallback={
            <p role="status" className="px-3 py-6 text-center text-ui-sm text-ink-3">
              Looking for your tasks…
            </p>
          }
          render={(m) => <m.TaskFinder dueBy={dueBy} onPick={onPick} />}
        />
      </ComboboxContent>
    </Combobox>
  )
}
