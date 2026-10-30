"use client"

import React from "react"
import { useTranslation } from "@/lib/utils/i18n"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { prioritiesInterface } from "@/types/table"
import { BUILT_IN_STATUSES, type StatusOption } from "@/lib/taskStatus"
import { cn } from "@/lib/utils/helpers/cn"
import { propertyLabel, propertyRow, propertyValue } from "@/lib/ui/propertyRow"
import { TaskStatusCell } from "@/components/task/taskStatusCell"
import { TaskPriorityCell } from "@/components/task/taskPriorityCell"
import { PriorityMenuContent, StatusMenuContent, menuSurface } from "@/components/task/StatusMenu"

type StatusPriorityControlsProps = {
  isAdmin: boolean
  selectedStatus?: StatusOption
  selectedPriority?: prioritiesInterface
  /** The project's statuses, built-in and its own; the built-in ones if left out. */
  statusOptions?: StatusOption[]
  onSelectStatus: (value: string) => void
  onSelectPriority: (value: string) => void
  /** Offer "Manage statuses…" at the foot of the list (the project's admins). */
  onManageStatuses?: () => void
}

/**
 * The panel's first two properties (design v3, work.md W29): Status and
 * Priority, each its glyph and word as a ghost field button that opens its
 * pop picker (W01, W02). A changed value springs in (glyph-swap).
 */
export function TaskStatusPriorityControl({
  isAdmin,
  selectedStatus,
  selectedPriority,
  statusOptions = BUILT_IN_STATUSES,
  onSelectStatus,
  onSelectPriority,
  onManageStatuses,
}: StatusPriorityControlsProps) {
  const { t } = useTranslation()
  const [openStatus, setOpenStatus] = React.useState(false)
  const [openPriority, setOpenPriority] = React.useState(false)
  // The first value is drawn still; only a change springs.
  const changed = React.useRef(false)

  return (
    <>
      <div className={propertyRow()} data-property="status">
        <span className={propertyLabel}>{t("status", { defaultValue: "Status" })}</span>
        <div className="min-w-0">
          <Popover open={openStatus} onOpenChange={setOpenStatus}>
            <PopoverTrigger asChild>
              <button type="button" data-touch-target="" className={cn(propertyValue, "w-fit")} disabled={!isAdmin} aria-label={`Status: ${selectedStatus?.label ?? "none"}. Change status`}>
                {selectedStatus ? (
                  <span key={selectedStatus.value} className={cn("inline-flex", changed.current && "[animation:work-glyph-in_220ms_var(--ease-spring)_both]")}>
                    <TaskStatusCell status={selectedStatus} />
                  </span>
                ) : (
                  <span className="text-ink-3">{t("setStatus", { defaultValue: "Set status" })}</span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className={menuSurface} align="start">
              <StatusMenuContent
                options={statusOptions}
                current={selectedStatus?.value}
                onSelect={(v) => {
                  changed.current = true
                  setOpenStatus(false)
                  onSelectStatus(v)
                }}
                onManage={
                  onManageStatuses
                    ? () => {
                        setOpenStatus(false)
                        onManageStatuses()
                      }
                    : undefined
                }
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className={propertyRow()} data-property="priority">
        <span className={propertyLabel}>{t("priority", { defaultValue: "Priority" })}</span>
        <div className="min-w-0">
          <Popover open={openPriority} onOpenChange={setOpenPriority}>
            <PopoverTrigger asChild>
              <button type="button" data-touch-target="" className={cn(propertyValue, "w-fit")} disabled={!isAdmin} aria-label={`Priority: ${selectedPriority?.label ?? "none"}. Change priority`}>
                <span key={selectedPriority?.value ?? "none"} className={cn("inline-flex", changed.current && "[animation:work-glyph-in_220ms_var(--ease-spring)_both]")}>
                  <TaskPriorityCell priority={selectedPriority?.value ?? ""} />
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent className={menuSurface} align="start">
              <PriorityMenuContent
                current={selectedPriority?.value}
                onSelect={(v) => {
                  changed.current = true
                  setOpenPriority(false)
                  onSelectPriority(v)
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </>
  )
}
