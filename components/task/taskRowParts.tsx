"use client"

import * as React from "react"
import { MenuOnDemand } from "@/components/ui/menuOnDemand"

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { AgentAvatar } from "@/components/ui/graphics/PrincipalAvatar"
import { PriorityGlyph, StatusGlyph } from "@/components/ui/graphics/glyphs"
import { statusKindOf } from "@/components/task/taskStatusCell"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { Settings } from "@/lib/icons"
import { displayNameOf } from "@/lib/personName"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { isBuiltInStatus, type StatusOption } from "@/lib/taskStatus"
import { cn } from "@/lib/utils/helpers/cn"
import type { UserProfileDataInterface } from "@/types/user"
import { useTranslation } from "@/lib/utils/i18n"
import { MenuCheck } from "@/components/ui/menuCheck"
import { NO_PRIORITY, TASK_PRIORITIES } from "@/types/taskScale"

/**
 * A task's assignee as design v3 draws it (work.md W19): a person's gradient
 * avatar (their photo when they have one), an agent's square, or, with
 * nobody, a dashed ring that shows while the row is pointed at.
 */
export function TaskAvatar({ user, size = 22, className }: { user?: UserProfileDataInterface | null; size?: number; className?: string }) {
  // Most people have no photo, and the photo's hook (an SWR subscription)
  // cost a phone's row 0.23 ms at 4x for nothing (fluid-17): only a photo asks.
  if (user?.user_uuid && user.user_profile_object_key) return <TaskAvatarPhoto user={user} size={size} className={className} />
  return <TaskFace user={user} size={size} className={className} />
}

function TaskAvatarPhoto(props: { user: UserProfileDataInterface; size: number; className?: string }) {
  return <TaskFace {...props} src={useUserAvatar(props.user.user_profile_object_key).src} />
}

function TaskFace({ user, size, className, src }: { user?: UserProfileDataInterface | null; size: number; className?: string; src?: string }) {
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
      <IdentityMark variant="avatar" id={avatarSeed(user)} label={name} src={src} size={size} aria-label={name} />
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
          <DropdownMenuItem key={o.value} onSelect={() => onPick(o.value)} aria-current={o.value === current || undefined} className="h-[30px] gap-2 rounded-md text-sm font-[450]">
            <StatusGlyph status={statusKindOf(o)} hue={o.hue} />
            <span className="min-w-0 flex-1 truncate">{isBuiltInStatus(o.value) ? t(o.value, { defaultValue: o.label }) : o.label}</span>
            <MenuCheck checked={o.value === current} className="text-ink-2" />
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

const PRIORITIES = [NO_PRIORITY, ...TASK_PRIORITIES]

/**
 * The priority picker (work.md W02): keys 0 to 4, the current one checked. In
 * the tree only while it is open, since every row of a list has one (F-1 #2):
 * its button is the trigger, and the menu joins when it is pressed.
 */
export function PriorityMenu({
  current,
  onPick,
  children,
}: {
  current: string
  onPick: (value: string) => void
  /** The button that opens it. */
  children: React.ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement>>
}) {
  const items = PRIORITIES
  return (
    <MenuOnDemand
      menu={(onDemand) => (
        <DropdownMenuContent
          {...onDemand}
          align="start"
          className="w-52 p-1"
          onKeyDown={(e) => {
            const p = items.find((x) => String(x.level) === e.key)
            if (p) {
              e.preventDefault()
              onPick(p.value)
            }
          }}
        >
          {items.map((p) => (
            <DropdownMenuItem key={p.value || "none"} onSelect={() => onPick(p.value)} aria-current={(current || "") === p.value || undefined} className="h-[30px] gap-2 rounded-md text-sm font-[450]">
              <PriorityGlyph level={p.level} />
              <span className="min-w-0 flex-1">{p.label}</span>
              <MenuCheck checked={(current || "") === p.value} className="text-ink-2" />
              <span className="kbd">{p.level}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      )}
    >
      {children}
    </MenuOnDemand>
  )
}
