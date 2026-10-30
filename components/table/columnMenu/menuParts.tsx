"use client"

// The rows, headers and hints both column menus are made of (the column's
// own and the "+"), in the menus' chunks.

import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { ChevronLeft, ChevronRight } from "@/lib/icons"
import { TOUCH_ROW } from "@/components/table/TableViewFrame"
import { ix } from "@/lib/ui/interactive"

/**
 * A type's one-line hint, at the end of its row in the type lists. The hint
 * gives way, never the type's name: the name's slot shrinks to nothing when
 * the hint keeps its full width, and "Date" read "D." beside a long hint.
 */
export function TypeHint({ children }: { children: React.ReactNode }) {
  return <span data-type-hint="" className="ml-auto min-w-0 max-w-[48%] shrink truncate text-right text-meta text-ink-3">{children}</span>
}


/** One 32 px row in the column menu. */
export function MenuRow({
  icon,
  label,
  hint,
  onClick,
  danger,
  sub,
  disabled,
}: {
  icon?: React.ReactNode
  label: React.ReactNode
  hint?: React.ReactNode
  onClick: () => void
  danger?: boolean
  sub?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      data-menu-row=""
      disabled={disabled}
      onClick={onClick}
      {...ix("item", { tone: danger ? "danger" : undefined })}
      className={cn(
        "flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left text-ui font-[450] text-ink disabled:pointer-events-none",
        TOUCH_ROW,
        "[&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-ink-3",
        danger && "text-danger-ink [&>svg]:text-danger-ink",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint ? <span className="shrink-0 text-meta text-ink-3">{hint}</span> : null}
      {sub ? <ChevronRight className="!size-3.5 text-ink-3" aria-hidden="true" /> : null}
    </button>
  )
}

export function Divider() {
  return <div aria-hidden="true" className="mx-2 my-1 h-px bg-line" />
}

/**
 * A settings page of the column menu (a formula, a relation, a rollup): its
 * header, a body that scrolls within the room the menu has, and its Cancel
 * and Save pinned at the foot, so a tall page never puts them off screen.
 */
export function SettingsPage({ title, onBack, footer, children }: { title: string; onBack: () => void; footer: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex max-h-[calc(var(--radix-popover-content-available-height,100dvh)-0.5rem)] flex-col" data-settings-page="">
      <div className="shrink-0 p-1">
        <SubHeader title={title} onBack={onBack} />
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-1 pb-1">{children}</div>
      <div className="flex shrink-0 justify-end gap-1.5 border-t border-line/60 px-1 pb-1 pt-1.5" data-settings-footer="">
        {footer}
      </div>
    </div>
  )
}

export function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex h-8 items-center gap-1 px-1">
      <button type="button" onClick={onBack} aria-label="Back" data-touch-target="" className="inline-flex size-6 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink">
        <ChevronLeft className="size-4" />
      </button>
      <span className="text-ui-sm font-semibold text-ink">{title}</span>
    </div>
  )
}
