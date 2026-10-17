"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { Calendar, CircleCheck, FolderKanban, Hash, Home, Inbox, MessageCircle, MoreHorizontal, Search } from "@/lib/icons"
import { IntentLink } from "@/components/navigationBar/desktop/IntentLink"
import { WorkspaceMark, WorkspaceMenu } from "@/components/navigationBar/desktop/SidebarHeader"
import { MorePopover } from "@/components/navigationBar/desktop/desktopSideNavigationBar"
import { ProfileMenu, SelfAvatar } from "@/components/navigationBar/desktop/SidebarFoot"
import { openPalette } from "@/lib/ui/palette"
import { formatCount } from "@/lib/utils/helpers/formatCount"
import { app_calendar_path, app_channel_path, app_chat_path, app_home_path, app_inbox_path, app_my_task_path, app_project_path } from "@/types/paths"
import type { DesktopNavType } from "@/types/nav"

/** A rail destination: where it goes, the section it owns, and what it counts. */
export interface RailPlace {
  title: string
  /** The first path segment after /app that makes it the current place. */
  segment: string
  href: string
  icon: typeof Home
}

/** The six daily places (design v3, mobile T2), in the rail's order. */
export const RAIL_PLACES: RailPlace[] = [
  { title: "Home", segment: "home", href: app_home_path, icon: Home },
  { title: "Channels", segment: "channel", href: app_channel_path, icon: Hash },
  { title: "DMs", segment: "chat", href: app_chat_path, icon: MessageCircle },
  { title: "Inbox", segment: "inbox", href: app_inbox_path, icon: Inbox },
  { title: "Tasks", segment: "myTask", href: app_my_task_path, icon: CircleCheck },
  { title: "Calendar", segment: "calendar", href: app_calendar_path, icon: Calendar },
]

/** What the rail counts: a brand badge for what is about you, a dot for the rest. */
export interface RailCounts {
  channel: number
  dm: number
  inbox: number
}

/** The rail place a path belongs to, or null (a project, Later, settings...). Pure. */
export function railPlaceOf(pathname: string): RailPlace | null {
  const segment = (pathname || "").split(/[?#]/)[0].split("/")[2] ?? ""
  return RAIL_PLACES.find((p) => p.segment === segment) ?? null
}

/** Everything else behind More: Later and Projects first, then the folded pages less Calendar (a cell of its own). Pure. */
export function railMoreLinks(primary: DesktopNavType[], more: DesktopNavType[], pathname: string): DesktopNavType[] {
  const later = primary.find((l) => l.title === "Later")
  const onProjects = pathname.startsWith(app_project_path)
  const projects: DesktopNavType = { title: "Projects", label: "", icon: FolderKanban, variant: onProjects ? "sidebarActive" : "ghost", path: app_project_path }
  return [...(later ? [later] : []), projects, ...more.filter((l) => l.title !== "Calendar")]
}

/** A cell's capsule and label; its count rides on the capsule. */
function Cell({ label, children, badge, dot }: { label: string; children: ReactNode; badge?: string; dot?: boolean }) {
  return (
    <>
      <span className="tablet-cap" aria-hidden="true">
        {children}
        {badge ? <i className="tablet-badge not-italic">{badge}</i> : dot ? <i className="tablet-dot" /> : null}
      </span>
      <span className="tablet-label" aria-hidden="true">{label}</span>
    </>
  )
}

/**
 * The tablet's rail (design v3, mobile T2; mock M7): 72px on the frame, the
 * workspace mark at the top on the glow, then the six daily places as 56px
 * cells (a 44x32 capsule with its 20px glyph, an 11px label under it), More,
 * and at the foot Search and your face. The current place is the desktop's
 * raised chip on its capsule, so the two shells speak one language. Every
 * cell is at least 44x44.
 *
 * In a channel, Channels opens and closes the channel list instead of leaving
 * for it (T3): onList.
 */
export function TabletRail({
  primary,
  more,
  counts,
  isAdmin,
  onList,
  listOpen = false,
}: {
  primary: DesktopNavType[]
  more: DesktopNavType[]
  counts: RailCounts
  isAdmin: boolean
  /** Toggles the channel list; given while a channel is open. */
  onList?: () => void
  listOpen?: boolean
}) {
  const pathname = usePathname() ?? ""
  const current = railPlaceOf(pathname)
  const moreLinks = railMoreLinks(primary, more, pathname)
  const moreCurrent = !current && moreLinks.some((l) => l.variant === "sidebarActive")

  const countFor = (p: RailPlace): { badge?: string; dot?: boolean; spoken: string } => {
    if (p.segment === "chat" && counts.dm > 0) return { badge: formatCount(counts.dm), spoken: `, ${counts.dm} unread` }
    if (p.segment === "inbox" && counts.inbox > 0) return { badge: formatCount(counts.inbox), spoken: `, ${counts.inbox} new` }
    if (p.segment === "channel" && counts.channel > 0) return { dot: true, spoken: ", unread" }
    return { spoken: "" }
  }

  return (
    <nav aria-label="Main" className="tablet-rail" data-tablet-rail="">
      <WorkspaceMenu isAdmin={isAdmin}>
        <button type="button" aria-label="Workspace menu" className="tablet-rail-mark">
          <WorkspaceMark size={32} />
        </button>
      </WorkspaceMenu>
      {RAIL_PLACES.map((p) => {
        const here = current?.segment === p.segment
        const { badge, dot, spoken } = countFor(p)
        const Icon = p.icon
        // In a channel, Channels is the way to the list (T3), not away from the channel.
        // Its name starts with the word on it, as every cell's does, so "tap
        // Channels" reaches it by voice; aria-expanded says the list is shown.
        if (p.segment === "channel" && onList) {
          return (
            <button
              key={p.title}
              type="button"
              onClick={onList}
              aria-current={here ? "page" : undefined}
              aria-expanded={listOpen}
              aria-label={`${p.title}${spoken}`}
              className="tablet-cell"
            >
              <Cell label={p.title} badge={badge} dot={dot}><Icon /></Cell>
            </button>
          )
        }
        return (
          <IntentLink key={p.title} href={p.href} scroll={false} aria-current={here ? "page" : undefined} aria-label={`${p.title}${spoken}`} className="tablet-cell">
            <Cell label={p.title} badge={badge} dot={dot}><Icon /></Cell>
          </IntentLink>
        )
      })}
      <MorePopover links={moreLinks}>
        <button type="button" aria-label={moreCurrent ? `More, on ${moreLinks.find((l) => l.variant === "sidebarActive")!.title}` : "More"} aria-current={moreCurrent ? "page" : undefined} className="tablet-cell">
          <Cell label="More"><MoreHorizontal /></Cell>
        </button>
      </MorePopover>
      <span className="flex-1" />
      <button type="button" data-palette-trigger="" onClick={() => openPalette({ mode: "search" })} aria-label="Search or ask" className="tablet-cell">
        <Cell label="Search"><Search /></Cell>
      </button>
      <ProfileMenu>
        <button type="button" aria-label="Profile and settings" className="tablet-rail-self">
          <SelfAvatar />
        </button>
      </ProfileMenu>
    </nav>
  )
}
