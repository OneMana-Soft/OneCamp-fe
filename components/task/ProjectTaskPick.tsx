"use client"

// A task of this project to pick, by its name: the menu a task's "waits on"
// row opened (TaskDependencies), now its own so a release's "Add tasks" and a
// task's "Link a task" open the same one. Its rows are the caller's (the project's timeline, read as
// the caller reads it); it draws them on the shared combobox, each led by what
// the caller passes (a status), and names the empty and loading states. A read
// that failed is the caller's shared error state with Try again, drawn in the
// list's place as the label picker draws one (TagPicker): the caller draws it,
// as this is none of the shared core, so a lazy chunk takes it.

import type { ReactElement, ReactNode } from "react"
import { isTouchScreen } from "@/lib/ui/touchScreen"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxGroup, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from "@/components/ui/combobox"

export interface PickableTask {
  task_uuid: string
  task_name: string
  task_status?: string
  task_key?: string
}

/** The tasks offered: none taken already, none canceled, none the server hasn't named yet. */
export function pickable<T extends PickableTask>(tasks: readonly T[], taken: ReadonlySet<string>): T[] {
  return tasks.filter((t) => !taken.has(t.task_uuid) && t.task_status !== "canceled" && !t.task_uuid.startsWith("temp-"))
}

export function ProjectTaskPick<T extends PickableTask>({
  open,
  onOpenChange,
  tasks,
  loading,
  failed,
  onPick,
  lead,
  head,
  keepOpen,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The rows, already pickable. */
  tasks: readonly T[]
  loading: boolean
  /** The tasks couldn't be read: the shared error state (ErrorState compact, with Try again), in the list's place. */
  failed?: ReactNode
  onPick: (task: T) => void
  /** A pick leaves it open: the caller closes it once the pick holds, so a refused one can be picked again. */
  keepOpen?: boolean
  /** What leads a row: its status. */
  lead?: (task: T) => ReactNode
  /** What a pick does, over the filter (how a link reads: ChipChoice); its keys stay its own. */
  head?: ReactNode
  /** The control that opens it. */
  children: ReactElement
}) {
  return (
    <Combobox open={open} onOpenChange={onOpenChange}>
      <ComboboxTrigger asChild>{children}</ComboboxTrigger>
      {/* Wider under a head, so its five ways sit in two even rows of chips. */}
      <ComboboxContent label="A task in this project" className={head ? "w-80" : "w-72"} onOpenAutoFocus={head ? filterFirst : undefined}>
        {failed ? (
          failed
        ) : (
          <>
            {/* Its keys stay its own: a radio group marks its arrows and Enter used, which the list (cmdk) passes over. */}
            {head && <div className="px-1 pb-2 pt-1">{head}</div>}
            <ComboboxInput placeholder="Find a task in this project" />
            <ComboboxList>
              <ComboboxEmpty>{loading ? "Loading…" : "No task to pick."}</ComboboxEmpty>
              <ComboboxGroup>
                {tasks.map((t) => (
                  <ComboboxItem key={t.task_uuid} value={`${t.task_key ?? ""} ${t.task_name} ${t.task_uuid}`} onSelect={() => onPick(t)} keepOpen={keepOpen}>
                    {lead?.(t)}
                    {t.task_key && <span className="mr-1.5 shrink-0 text-meta font-[510] tabular-nums text-ink-3">{t.task_key}</span>}
                    <span className="truncate">{t.task_name}</span>
                  </ComboboxItem>
                ))}
              </ComboboxGroup>
            </ComboboxList>
          </>
        )}
      </ComboboxContent>
    </Combobox>
  )
}

/**
 * Under a head the filter takes the focus as the picker opens, as it does with
 * none: Radix's first tabbable would be the head's pick. Typing finds the task,
 * and Shift+Tab reaches how it links. A touch screen's open stays the
 * combobox's own (the sheet itself, no keyboard thrown up).
 */
const filterFirst = (event: Event) => {
  if (isTouchScreen()) return
  const filter = (event.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>("[cmdk-input]")
  if (!filter) return
  event.preventDefault()
  filter.focus()
}
