"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Hash, Lock, MessageCircle, MoreHorizontal, PanelLeft, Search } from "@/lib/icons"
import { IntentLink } from "@/components/navigationBar/desktop/IntentLink"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { WorkspaceMark, WorkspaceMenu } from "@/components/navigationBar/desktop/SidebarHeader"
import { MorePopover } from "@/components/navigationBar/desktop/desktopSideNavigationBar"
import { ProjectTile } from "@/components/ui/graphics/ProjectTile"
import { ProfileMenu, SelfAvatar } from "@/components/navigationBar/desktop/SidebarFoot"
import { openPalette } from "@/lib/ui/palette"
import { cn } from "@/lib/utils/helpers/cn"
import type { DesktopChildrenNavType, DesktopNavType } from "@/types/nav"
import { rowSignal, type SidebarSignal } from "@/lib/nav/sidebarSignal"
import { app_channel_path, app_chat_path } from "@/types/paths"

/** One rail item: a 36x32 button on the 24px axis, its count kept visible. */
export function RailItem({
  href,
  title,
  active,
  badge,
  spoken,
  dot,
  children,
}: {
  href: string
  title: string
  active?: boolean
  badge?: string
  /** What a screen reader hears after the title, when the badge alone wouldn't say it ("@2"). */
  spoken?: string
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
          aria-label={spoken ? `${title}${spoken}` : badge ? `${title}, ${badge}` : dot ? `${title}, unread` : title}
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

/** Whether the pointer is on one of the rail's own controls (an item, More, your face). */
export function onRailControl(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest("a, button, [role=separator]")
}

/**
 * The collapsed rail (design v3, shell S13): 56px, the mark, search, the four
 * primary places and More, then the projects and starred channels (up to
 * six), and your face at the bottom. Counts stay visible: a mention or DM
 * count as a 15px badge, a plain unread as a 6px dot (lib/nav/sidebarSignal).
 *
 * The peek: resting the pointer on the rail's own ground (between and below
 * its items, never on one) for 300ms, or on the window's left edge, floats
 * the full sidebar over the sheet; it closes 200ms after the pointer leaves,
 * and its pin opens the sidebar for good. Keyboard people use ⌘\ instead.
 * It was armed by a strip over the rail's right half, which sat on top of
 * every item: a click on an item's right 40% landed on the strip, did
 * nothing, and opened the peek over the rail a moment later. Arming takes a
 * pointer that moves there, so a pointer left resting at the edge as a page
 * loads does not open it.
 */
export function SidebarRail({
  primary,
  more = [],
  places,
  isAdmin,
  onExpand,
  peek,
  body,
  conversations,
}: {
  /** In its place, what the rail holds instead of the app's places (the settings sections). */
  body?: ReactNode
  primary: DesktopNavType[]
  /** Every page that isn't daily, behind More, as the sidebar has it. */
  more?: DesktopNavType[]
  places: DesktopChildrenNavType[]
  isAdmin: boolean
  onExpand: () => void
  /** The full sidebar, drawn inside the peek; given how to keep it open. */
  peek: (pin: () => void) => ReactNode
  /**
   * Channels and DMs, with what is unread in them, and which is open. A new
   * DM showed nowhere on the rail: it held projects and starred places only,
   * and the Inbox leaves DMs out, so a collapsed sidebar (⌘\, and every
   * window under 1024px) hid it. Each says what its folded section would
   * (lib/nav/sidebarSignal): "@2" for mentions of you in channels, a dot for
   * other unread; DMs count the conversations with something unread (SN-19).
   */
  conversations?: { channels: SidebarSignal; dms: SidebarSignal; on?: "channel" | "chat" }
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
  // The pointer is back on the peek, or on the window's edge it opened from:
  // it stays, and a fade already under way turns back. The peek floats 8px
  // in and slides there, so it leaves a pointer resting at the edge, which
  // closed it 340ms after it opened. An enter only keeps an open peek; it
  // never opens one (a strip mounting under a resting pointer gets an enter).
  const keep = () => {
    clear()
    setPeeking((p) => (p ? "open" : p))
  }
  // On an item the pointer is aiming at it, not asking for the peek.
  const holdOff = () => {
    if (openTimer.current) window.clearTimeout(openTimer.current)
    openTimer.current = null
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
      <nav
        aria-label="Main"
        className="shell-side h-full w-14"
        data-rail="true"
        onPointerMove={(e) => (e.pointerType === "touch" ? undefined : onRailControl(e.target) ? holdOff() : arm())}
        onPointerLeave={(e) => (e.pointerType === "touch" ? undefined : disarm())}
      >
        <WorkspaceMenu isAdmin={isAdmin}>
          <button type="button" aria-label="Workspace menu" className="mb-2.5 grid size-8 place-items-center rounded-md shell-hover">
            <WorkspaceMark size={24} />
          </button>
        </WorkspaceMenu>
        {body ?? (
          <>
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
        {conversations && (
          <>
            <RailItem href={app_channel_path} title="Channels" active={conversations.on === "channel"} badge={conversations.channels.badge} spoken={conversations.channels.spoken} dot={conversations.channels.unread}>
              <Hash className="h-4 w-4" aria-hidden="true" />
            </RailItem>
            <RailItem href={app_chat_path} title="DMs" active={conversations.on === "chat"} badge={conversations.dms.badge} spoken={conversations.dms.spoken} dot={conversations.dms.unread}>
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
            </RailItem>
          </>
        )}
        {more.length > 0 && (
          <MorePopover links={more}>
            <button
              type="button"
              aria-label={more.some((l) => l.variant === "sidebarActive") ? `More, on ${more.find((l) => l.variant === "sidebarActive")!.title}` : "More"}
              className={cn("shell-rail-item data-[state=open]:bg-press", more.some((l) => l.variant === "sidebarActive") ? "nav-active" : "nav-idle")}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </button>
          </MorePopover>
        )}
        {places.length > 0 && <span className="shell-rail-sep" aria-hidden="true" />}
        <div className="flex min-h-0 flex-col items-center gap-0.5 overflow-hidden">
          {places.slice(0, 6).map((p) => {
            const signal = rowSignal(p)
            return (
              <RailItem key={p.path} href={p.path} title={p.title} active={p.variant === "sidebarActive"} badge={signal.badge} spoken={signal.spoken} dot={signal.unread}>
                {p.project_uuid ? <ProjectTile id={p.project_uuid} /> : p.icon ? <p.icon className="h-4 w-4" aria-hidden="true" /> : p.isPrivate ? <Lock className="h-4 w-4" aria-hidden="true" /> : <Hash className="h-4 w-4" aria-hidden="true" />}
              </RailItem>
            )
          })}
        </div>
          </>
        )}
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
      </nav>
      {/* The window's left edge arms the peek too (Arc), clear of the items. */}
      <span
        aria-hidden="true"
        data-peek-edge=""
        className="fixed inset-y-0 left-0 z-[var(--z-fixed)] w-1"
        onPointerMove={(e) => (e.pointerType === "touch" ? undefined : arm())}
        onPointerEnter={keep}
        onPointerLeave={disarm}
      />
      {peeking && (
        <div
          className="app-frame shell-peek"
          data-leaving={peeking === "leaving" ? "true" : undefined}
          role="dialog"
          aria-label="Sidebar"
          onPointerEnter={keep}
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
