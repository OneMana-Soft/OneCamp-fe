"use client"

import * as React from "react"
import { useTranslation } from "@/lib/utils/i18n"

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import { Settings2 } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { BUILT_IN_STATUSES, type StatusCategory, type StatusOption } from "@/lib/taskStatus"
import { TaskStatusCell } from "@/components/task/taskStatusCell"
import { TaskPriorityCell } from "@/components/task/taskPriorityCell"
import { MenuCheck, menuCheckState } from "@/components/ui/menuCheck"
import { TASK_PRIORITIES } from "@/types/taskScale"

/**
 * The status and priority pickers (design v3, work.md W01, W02): a pop menu
 * with a filter field (its shortcut on the right), then the choices as 30 px
 * rows with their glyph, name and number key, the current one checked on the
 * far right. Statuses are grouped by the category they count as, in workflow
 * order, built-in first and each project status under its category; admins
 * get "Manage statuses…" at the foot. Typing a number picks that row.
 *
 * The content only: put it in a Popover (PopoverContent with menuSurface) or
 * a Drawer on a phone.
 */
export const menuSurface = "w-64 rounded-lg p-1 shadow-e3"

const CATEGORY_ORDER: StatusCategory[] = ["backlog", "todo", "inProgress", "inReview", "done", "canceled"]

const itemClass = "h-[30px] gap-2 rounded-md px-2 text-sm font-[450] data-[selected=true]:bg-press"

/**
 * The row's right side: its number key, then the current one's check (the
 * shared MenuCheck, at the end as a select's chosen option has it). The row
 * says it's current with menuCheckState.
 */
function RowEnd({ n, current }: { n: number | null; current: boolean }) {
  return (
    <span className="ml-auto flex shrink-0 items-center gap-2">
      {n !== null && n <= 9 ? <span data-kbd-hint="" className="kbd">{n}</span> : null}
      <MenuCheck checked={current} className="text-ink-2" />
    </span>
  )
}

/** Picks the nth choice when a digit is typed in the menu (not into its filter once it has text). */
function useNumberKeys(count: number, pick: (index: number) => void) {
  return React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const filter = e.target instanceof HTMLInputElement ? e.target.value : ""
      if (filter) return
      if (!/^[0-9]$/.test(e.key)) return
      const i = Number(e.key) - 1
      if (i >= 0 && i < count) {
        e.preventDefault()
        pick(i)
      }
    },
    [count, pick],
  )
}

export function StatusMenuContent({
  options = BUILT_IN_STATUSES,
  current,
  onSelect,
  onManage,
}: {
  options?: StatusOption[]
  current?: string
  onSelect: (value: string) => void
  onManage?: () => void
}) {
  const { t } = useTranslation()
  // Workflow order, each category's built-in first and its own statuses after.
  const ordered = React.useMemo(
    () => CATEGORY_ORDER.flatMap((c) => options.filter((o) => o.category === c).sort((a, b) => Number(a.custom) - Number(b.custom))),
    [options],
  )
  const onKeyDown = useNumberKeys(ordered.length, (i) => onSelect(ordered[i].value))
  return (
    <Command onKeyDown={onKeyDown} className="bg-transparent">
      <div className="relative">
        <CommandInput placeholder={t("changeStatusPlaceHolder", { defaultValue: "Change status…" })} className="h-8 pr-8" />
        <span data-kbd-hint="" className="kbd pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">S</span>
      </div>
      <CommandList className="max-h-80">
        <CommandEmpty>{t("noResultFound")}</CommandEmpty>
        <CommandGroup className="p-0">
          {ordered.map((status, i) => (
            <CommandItem
              key={status.value}
              // Searched by what people read; the value comes from the option,
              // since cmdk may lowercase the one it hands back.
              value={`${status.label} ${status.value}`}
              onSelect={() => onSelect(status.value)}
              className={itemClass}
              {...menuCheckState(current === status.value)}
            >
              <TaskStatusCell status={status} className="min-w-0" />
              <RowEnd n={i + 1} current={current === status.value} />
            </CommandItem>
          ))}
        </CommandGroup>
        {onManage && (
          <>
            <CommandSeparator className="my-1" />
            <CommandGroup className="p-0">
              <CommandItem value="manage statuses edit add custom status" onSelect={onManage} className={cn(itemClass, "text-ink-2")}>
                <Settings2 className="h-3.5 w-3.5" />
                Manage statuses…
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </Command>
  )
}

/** The priorities the server takes, in key order (W02: the key is the level). */
const PRIORITY_CHOICES = [...TASK_PRIORITIES].reverse().map((p) => p.value)

export function PriorityMenuContent({
  current,
  onSelect,
  values = PRIORITY_CHOICES,
}: {
  current?: string
  onSelect: (value: string) => void
  /** The priorities this workspace has; no priority is "". */
  values?: readonly string[]
}) {
  const { t } = useTranslation()
  const onKeyDown = useNumberKeys(values.length, (i) => onSelect(values[i]))
  return (
    <Command onKeyDown={onKeyDown} className="bg-transparent">
      <div className="relative">
        <CommandInput placeholder={t("changePriority", { defaultValue: "Change priority…" })} className="h-8 pr-8" />
        <span data-kbd-hint="" className="kbd pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">P</span>
      </div>
      <CommandList>
        <CommandEmpty>{t("noResultFound")}</CommandEmpty>
        <CommandGroup className="p-0">
          {values.map((v, i) => (
            <CommandItem key={v || "none"} value={v || "no priority"} onSelect={() => onSelect(v)} className={itemClass} {...menuCheckState((current ?? "") === v)}>
              <TaskPriorityCell priority={v} />
              <RowEnd n={i + 1} current={(current ?? "") === v} />
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}
