"use client"

import * as React from "react"

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { AgentAvatar } from "@/components/ui/graphics/PrincipalAvatar"
import { PriorityGlyph, StatusGlyph } from "@/components/ui/graphics/glyphs"
import { statusKindOf } from "@/components/task/taskStatusCell"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { Check, Settings } from "@/lib/icons"
import { displayNameOf } from "@/lib/personName"
import { isBuiltInStatus, type StatusOption } from "@/lib/taskStatus"
import { cn } from "@/lib/utils/helpers/cn"
import type { UserProfileDataInterface } from "@/types/user"
import { useTranslation } from "react-i18next"

/**
 * A task's assignee as design v3 draws it (work.md W19): a person's gradient
 * avatar (their photo when they have one), an agent's square, or, with
 * nobody, a dashed ring that shows while the row is pointed at.
 */
export function TaskAvatar({ user, size = 22, className }: { user?: UserProfileDataInterface | null; size?: number; className?: string }) {
  const { src } = useUserAvatar(user?.user_profile_object_key)
  if (!user || !user.user_uuid) {
    return (
      <span
        aria-label="Unassigned"
        role="img"
        data-assignee="none"
        className={cn("inline-block shrink-0 rounded-full border border-dashed border-line-3 opacity-0 transition-opacity group-hover/row:opacity-100", className)}
        style={{ width: size, height: size }}
      />
    )
  }
  const name = displayNameOf(user)
  if ((user as { is_bot?: boolean }).is_bot) {
    return (
      <span data-tip={name} className={cn("work-tip inline-flex shrink-0", className)} style={{ width: size, height: size }} data-assignee="agent">
        <AgentAvatar src={src} />
      </span>
    )
  }
  return (
    <span data-tip={name} className={cn("work-tip inline-flex shrink-0", className)} data-assignee="person">
      <IdentityMark variant="avatar" id={user.user_uuid} label={name} src={src} size={size} aria-label={name} />
    </span>
  )
}

/** The status picker (work.md W01): grouped by category, number keys, the current one checked, "Manage statuses…" for admins. */
export function StatusMenu({
  options,
  current,
  onPick,
  onManage,
  children,
  open,
  onOpenChange,
}: {
  options: StatusOption[]
  current: string
  onPick: (value: string) => void
  onManage?: () => void
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const [filter, setFilter] = React.useState("")
  const shown = options.filter((o) => !filter || o.label.toLowerCase().includes(filter.toLowerCase()))
  return (
    <DropdownMenu open={open} onOpenChange={(o) => { if (!o) setFilter(""); onOpenChange?.(o) }}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60 p-1" onKeyDown={(e) => {
        const n = Number(e.key)
        if (!filter && n >= 1 && n <= 9 && shown[n - 1]) {
          e.preventDefault()
          onPick(shown[n - 1].value)
          onOpenChange?.(false)
        }
      }}>
        <div className="flex h-8 items-center gap-2 px-2">
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Change status…"
            aria-label="Change status"
            className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
          />
          <span className="kbd">S</span>
        </div>
        <DropdownMenuSeparator />
        {shown.map((o, i) => (
          <DropdownMenuItem key={o.value} onSelect={() => onPick(o.value)} className="h-[30px] gap-2 rounded-md text-sm font-[450]">
            <StatusGlyph status={statusKindOf(o)} hue={o.hue} />
            <span className="min-w-0 flex-1 truncate">{isBuiltInStatus(o.value) ? t(o.value, { defaultValue: o.label }) : o.label}</span>
            {o.value === current && <Check className="size-3.5 text-ink-2" aria-label="Current" />}
            {i < 9 && <span className="kbd">{i + 1}</span>}
          </DropdownMenuItem>
        ))}
        {onManage && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onManage} className="h-[30px] gap-2 rounded-md text-sm text-ink-2">
              <Settings className="size-3.5" />
              Manage statuses…
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const PRIORITIES = [
  { value: "", label: "No priority", level: 0 },
  { value: "urgent", label: "Urgent", level: 4 },
  { value: "high", label: "High", level: 3 },
  { value: "medium", label: "Medium", level: 2 },
  { value: "low", label: "Low", level: 1 },
] as const

/** The priority picker (work.md W02): keys 0 to 4, the current one checked. */
export function PriorityMenu({ current, onPick, children, withUrgent = false }: { current: string; onPick: (value: string) => void; children: React.ReactNode; withUrgent?: boolean }) {
  const items = PRIORITIES.filter((p) => withUrgent || p.value !== "urgent")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52 p-1" onKeyDown={(e) => {
        const p = items.find((x) => String(x.level) === e.key)
        if (p) {
          e.preventDefault()
          onPick(p.value)
        }
      }}>
        {items.map((p) => (
          <DropdownMenuItem key={p.value || "none"} onSelect={() => onPick(p.value)} className="h-[30px] gap-2 rounded-md text-sm font-[450]">
            <PriorityGlyph level={p.level} />
            <span className="min-w-0 flex-1">{p.label}</span>
            {(current || "") === p.value && <Check className="size-3.5 text-ink-2" aria-label="Current" />}
            <span className="kbd">{p.level}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
