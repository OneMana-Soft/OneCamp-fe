"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Hash, Lock, PanelLeft, Search } from "@/lib/icons"
import { IntentLink } from "@/components/navigationBar/desktop/IntentLink"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { WorkspaceMark, WorkspaceMenu } from "@/components/navigationBar/desktop/SidebarHeader"
import { ProjectTile } from "@/components/navigationBar/desktop/desktopSideNavigationBar"
import { ProfileMenu, SelfAvatar } from "@/components/navigationBar/desktop/SidebarFoot"
import { openPalette } from "@/lib/ui/palette"
import { formatCount } from "@/lib/utils/helpers/formatCount"
import { cn } from "@/lib/utils/helpers/cn"
import type { DesktopChildrenNavType, DesktopNavType } from "@/types/nav"

/** One rail item: a 36x32 button on the 24px axis, its count kept visible. */
function RailItem({
  href,
  title,
  active,
  badge,
  dot,
  children,
}: {
  href: string
  title: string
  active?: boolean
  badge?: string
  dot?: boolean
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <IntentLink
          href={href}
          scroll={false}
          aria-current={active ? "page" : undefined}
          aria-label={badge ? `${title}, ${badge}` : dot ? `${title}, unread` : title}
          className={cn("shell-rail-item", active ? "nav-active" : "nav-idle")}
        >
          {children}
          {badge ? <i className="shell-rail-badge not-italic" aria-hidden="true">{badge}</i> : dot ? <i className="shell-rail-dot" aria-hidden="true" /> : null}
        </IntentLink>
      </TooltipTrigger>
      <TooltipContent side="right">{title}</TooltipContent>
    </Tooltip>
  )
}

/**
 * The collapsed rail (design v3, shell S13): 56px, the mark, search, the four
 * primary places, then the projects and starred channels (up to six), and your
 * face at the bottom. Counts stay visible: a mention or DM count as a 15px
 * badge, a plain unread as a 6px dot. Resting on the rail's right half for
 * 300ms, or on the window's left edge, floats the full sidebar over the sheet
 * (the peek); it closes 200ms after the pointer leaves, and its pin opens the
 * sidebar for good. Keyboard people use ⌘\ instead.
 */
export function SidebarRail({
  primary,
  places,
  isAdmin,
  onExpand,
  peek,
}: {
  primary: DesktopNavType[]
  places: DesktopChildrenNavType[]
  isAdmin: boolean
  onExpand: () => void
  /** The full sidebar, drawn inside the peek; given how to keep it open. */
  peek: (pin: () => void) => ReactNode
}) {
  const [peeking, setPeeking] = useState<"open" | "leaving" | null>(null)
  const openTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)
  const clear = () => {
    if (openTimer.current) window.clearTimeout(openTimer.current)
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
  }
  const arm = () => {
    clear()
    if (peeking === "open") return
    openTimer.current = window.setTimeout(() => setPeeking("open"), 300)
  }
  const disarm = () => {
    clear()
    if (!peeking) return
    closeTimer.current = window.setTimeout(() => {
      setPeeking("leaving")
      closeTimer.current = window.setTimeout(() => setPeeking(null), 140)
    }, 200)
  }
  useEffect(() => clear, [])
  useEffect(() => {
    if (!peeking) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPeeking(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [peeking])

  return (
    <>
      <nav aria-label="Main" className="shell-side h-full w-14" data-rail="true">
        <WorkspaceMenu isAdmin={isAdmin}>
          <button type="button" aria-label="Workspace menu" className="mb-2.5 grid size-8 place-items-center rounded-md shell-hover">
            <WorkspaceMark size={24} />
          </button>
        </WorkspaceMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" data-palette-trigger="" onClick={() => openPalette({ mode: "search" })} aria-label="Search or ask" className="shell-rail-item nav-idle">
              <Search className="h-4 w-4" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Search or ask</TooltipContent>
        </Tooltip>
        <span className="shell-rail-sep" aria-hidden="true" />
        {primary.map((l) => (
          <RailItem key={l.title} href={String(l.path)} title={l.title} active={l.variant === "sidebarActive"} badge={l.title === "Inbox" && l.label ? l.label : undefined} dot={l.title !== "Inbox" && !!l.label}>
            {l.icon && <l.icon className="h-4 w-4" aria-hidden="true" />}
          </RailItem>
        ))}
        {places.length > 0 && <span className="shell-rail-sep" aria-hidden="true" />}
        <div className="flex min-h-0 flex-col items-center gap-0.5 overflow-hidden">
          {places.slice(0, 6).map((p) => {
            const n = p.unread_count || 0
            return (
              <RailItem key={p.path} href={p.path} title={p.title} active={p.variant === "sidebarActive"} badge={n && p.badge ? formatCount(n) : undefined} dot={!!n && !p.badge}>
                {p.project_uuid ? <ProjectTile uuid={p.project_uuid} name={p.title} /> : p.isPrivate ? <Lock className="h-4 w-4" aria-hidden="true" /> : <Hash className="h-4 w-4" aria-hidden="true" />}
              </RailItem>
            )
          })}
        </div>
        <span className="flex-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={onExpand} aria-label="Expand sidebar" className="shell-rail-item nav-idle mb-1">
              <PanelLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Expand sidebar<span className="shell-tip-kbd">⌘\</span></TooltipContent>
        </Tooltip>
        <ProfileMenu>
          <button type="button" aria-label="Profile and settings" className="grid size-9 place-items-center rounded-md shell-hover">
            <SelfAvatar />
          </button>
        </ProfileMenu>
        {/* The right half of the rail, and the window's left edge, arm the peek. */}
        <span aria-hidden="true" className="absolute inset-y-0 right-0 w-1/2" onPointerEnter={arm} onPointerLeave={disarm} style={{ pointerEvents: peeking ? "none" : undefined }} />
      </nav>
      <span aria-hidden="true" className="fixed inset-y-0 left-0 z-[var(--z-fixed)] w-1" onPointerEnter={arm} onPointerLeave={disarm} />
      {peeking && (
        <div
          className="shell-peek"
          data-leaving={peeking === "leaving" ? "true" : undefined}
          role="dialog"
          aria-label="Sidebar"
          onPointerEnter={clear}
          onPointerLeave={disarm}
        >
          <div className="relative flex h-full flex-col">
            {peek(() => {
              setPeeking(null)
              onExpand()
            })}
          </div>
        </div>
      )}
    </>
  )
}
