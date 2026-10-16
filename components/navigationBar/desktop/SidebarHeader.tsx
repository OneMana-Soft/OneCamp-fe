"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useDispatch } from "react-redux"
import * as Menu from "@radix-ui/react-dropdown-menu"
import { ChevronsUpDown, CircleHelp, Gift, PanelLeft, Pin, Settings, Shield, SquarePen, UserPlus } from "@/lib/icons"
import { openUI } from "@/store/slice/uiSlice"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { returnFocusOnlyForKeys, watchInputModality } from "@/lib/ui/inputModality"
import { useCapabilities } from "@/hooks/useCapabilities"
import { CAP_INVITATION_CREATE } from "@/services/capabilityService"
import { useWorkspaceName } from "@/hooks/useWorkspaceName"

/** The host people reach this workspace at, for the menu's second line. */
function workspaceHost(): string {
  const url = process.env.NEXT_PUBLIC_FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL
  try {
    if (url) return new URL(url).host
  } catch {
    /* not a URL */
  }
  return typeof window === "undefined" ? "" : window.location.host
}

/** The product's site (NEXT_PUBLIC_PRODUCT_SITE), never a hostname written here; "" when unset. */
const productSite = () => (process.env.NEXT_PUBLIC_PRODUCT_SITE || "").replace(/\/$/, "")

const MARK_DRAWN_KEY = "onecamp:mark-drawn"

/**
 * Whether the ring in the mark should draw itself: once, on the day's first
 * open of the app in this browser (device date). Storage can refuse; then it
 * never draws, which is the quiet failure.
 */
function firstOpenToday(): boolean {
  try {
    const today = new Date().toLocaleDateString("en-CA")
    if (localStorage.getItem(MARK_DRAWN_KEY) === today) return false
    localStorage.setItem(MARK_DRAWN_KEY, today)
    return true
  } catch {
    return false
  }
}

/**
 * The workspace mark: a 26px tile in the logo gradient with the white ring,
 * the only gradient in the chrome (design v3, shell S3). An install with its
 * own logo (NEXT_PUBLIC_ORG_LOGO) shows it on the raised surface instead.
 */
export function WorkspaceMark({ size = 26, draw = false }: { size?: 32 | 26 | 24 | 16; draw?: boolean }) {
  const logo = process.env.NEXT_PUBLIC_ORG_LOGO
  if (logo) {
    return (
      <span className="shell-mark" data-logo="" data-size={size === 26 ? undefined : size} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" className="h-full w-full object-cover" />
      </span>
    )
  }
  const glyph = size === 32 ? 20 : size === 26 ? 16 : size === 24 ? 14 : 10
  return (
    <span className="shell-mark" data-size={size === 26 ? undefined : size} aria-hidden="true" style={size === 16 ? { width: 16, height: 16, borderRadius: 5 } : undefined}>
      <svg width={glyph} height={glyph} viewBox="0 0 24 24" aria-hidden="true">
        <circle
          className="shell-mark-ring"
          data-draw={draw ? "true" : undefined}
          cx="12"
          cy="12"
          r="7"
          fill="none"
          stroke="#fff"
          strokeWidth={size === 16 ? 4 : 3.6}
          pathLength={100}
          transform="rotate(-90 12 12)"
        />
      </svg>
    </span>
  )
}

interface SidebarHeaderProps {
  isAdmin: boolean
  /** Collapses the sidebar to the rail (⌘\). */
  onCollapse: () => void
  /** In the rail's peek: the same slot keeps the sidebar open instead. */
  onPin?: () => void
}

/**
 * The sidebar's header row (design v3, shell S3 and M1): the mark, the
 * workspace's name and ⇅ open the workspace menu; the collapse control shows
 * on hover; compose opens the new-message picker. Home is the Home row and
 * G H, so the mark no longer goes home (owner decision 4).
 */
export function SidebarHeader({ isAdmin, onCollapse, onPin }: SidebarHeaderProps) {
  const dispatch = useDispatch()
  const name = useWorkspaceName()
  const [draw, setDraw] = useState(false)
  useEffect(() => setDraw(firstOpenToday()), [])

  return (
    <div className="flex items-center gap-0.5">
      <WorkspaceMenu isAdmin={isAdmin}>
        <button
          type="button"
          aria-label={`${name} workspace menu`}
          className="shell-ws shell-hover min-w-0 flex-1"
        >
          <WorkspaceMark draw={draw} />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span>
          <ChevronsUpDown className="shell-chevron h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        </button>
      </WorkspaceMenu>
      {onPin ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={onPin} aria-label="Keep the sidebar open" className="shell-icon-btn" data-size="24">
              <Pin className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Keep the sidebar open</TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Collapse sidebar"
              className="shell-icon-btn shell-reveal"
              data-size="24"
            >
              <PanelLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Collapse sidebar<span className="shell-tip-kbd">⌘\</span>
          </TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => dispatch(openUI({ key: "createChatMessage" }))}
            aria-label="New message"
            className="shell-icon-btn"
          >
            <SquarePen className="h-4 w-4" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          New message<span className="shell-tip-kbd">N</span>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

/**
 * The workspace menu (design v3, shell M1): 264px, r12, e3, dropping 4px under
 * the header, left-aligned, popping from its top-left. OneCamp is one
 * workspace per install, so there is no "switch workspace" row: ⇅ means menu.
 * Admin-only rows are absent for everyone else, never greyed.
 */
export function WorkspaceMenu({ isAdmin, children }: { isAdmin: boolean; children: React.ReactNode }) {
  const router = useRouter()
  // Invite people is offered to whoever may invite (admins, and members when
  // an admin allows it), as the palette and the phone's sheets offer it: a
  // member who couldn't was offered it, and refused (QA SH-02).
  const { can } = useCapabilities()
  const name = useWorkspaceName()
  const host = workspaceHost()
  useEffect(() => watchInputModality(), [])

  return (
    <Menu.Root>
      <Menu.Trigger asChild>{children}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="start"
          sideOffset={4}
          aria-label="Workspace"
          onCloseAutoFocus={returnFocusOnlyForKeys}
          className="shell-menu shell-pop z-[var(--z-dropdown)] origin-[var(--radix-dropdown-menu-content-transform-origin)]"
        >
          <div className="flex items-center gap-2.5 px-2 pb-2.5 pt-2">
            <WorkspaceMark />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{name}</div>
              {host && <div className="truncate text-2xs text-ink-3">{host}</div>}
            </div>
          </div>
          <div className="shell-menu-sep" />
          {can(CAP_INVITATION_CREATE) && (
            <Menu.Item className="shell-menu-item" onSelect={() => window.dispatchEvent(new CustomEvent("open-invite-people"))}>
              <UserPlus aria-hidden="true" />
              Invite people
              <span data-kbd-hint="" className="kbd ml-auto">I</span>
            </Menu.Item>
          )}
          {isAdmin && (
            <>
              <Menu.Item className="shell-menu-item" onSelect={() => router.push("/app/admin?tab=settings")}>
                <Settings aria-hidden="true" />
                Workspace settings
              </Menu.Item>
              <Menu.Item className="shell-menu-item" onSelect={() => router.push("/app/admin")}>
                <Shield aria-hidden="true" />
                Admin
                <span className="shell-menu-meta">audit, agents, SSO</span>
              </Menu.Item>
            </>
          )}
          {/* Release notes and the docs live on the product's site; an install
              that names none shows neither row rather than a dead link. */}
          {productSite() && (
            <>
              <div className="shell-menu-sep" />
              {/* The release notes (QA SH-22): it opened the blog. */}
              <Menu.Item className="shell-menu-item" onSelect={() => window.open(`${productSite()}/changelog`, "_blank", "noopener,noreferrer")}>
                <Gift aria-hidden="true" />
                What&apos;s new
              </Menu.Item>
              <Menu.Item className="shell-menu-item" onSelect={() => window.open(`${productSite()}/docs`, "_blank", "noopener,noreferrer")}>
                <CircleHelp aria-hidden="true" />
                Help and docs
              </Menu.Item>
            </>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}
