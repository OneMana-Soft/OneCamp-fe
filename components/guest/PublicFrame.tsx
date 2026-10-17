"use client"

import * as React from "react"

import { MadeWithOneCamp, type PublicSurface } from "@/components/public/MadeWithOneCamp"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { cn } from "@/lib/utils/helpers/cn"

import { GUEST_HUE } from "./guestUi"
import { namedWorkspace } from "@/lib/workspaceName"

/**
 * The page people outside the workspace see (content.md rule 6): public
 * booking, booking management, and the guest doc, table, board and project.
 * They judge the product by it without signing in, so it is a finished page:
 *
 * - a 4 px band in the workspace's hue across the top;
 * - the workspace mark and its name (publicWorkspaceName);
 * - `--frame` with the campfire glow at half strength and the grain;
 * - an optional 56 px header, transparent until the page scrolls, then the
 *   sheet at 85 % with the one blur;
 * - "Made with OneCamp" as a badge under the page (MadeWithOneCamp).
 *
 * Content goes in as children, usually on a `PaperCard`.
 */
export interface PublicFrameProps {
  surface: PublicSurface
  /** The page's own title, after the mark in the header ("How we work"). */
  title?: React.ReactNode
  /** The workspace's name beside the mark, when the page knows it. */
  workspaceName?: string
  /** Header content on the right: the permission tag, "Open in OneCamp". */
  actions?: React.ReactNode
  /** Leave the header out (the booking page has none). */
  header?: boolean
  /**
   * The frame is exactly the window's height and its main area scrolls inside
   * (a live channel, whose composer docks at the bottom), with the credit on
   * one short line under it.
   */
  fill?: boolean
  /** Extra footer content after the credit (a time-zone line). */
  footer?: React.ReactNode
  /** "Report this page" link target, when the page has one. */
  reportHref?: string
  className?: string
  mainClassName?: string
  children: React.ReactNode
}

/**
 * The workspace a public page belongs to (G1, content.md rule 6): the
 * server's public name for it (`workspace_name` on the guest answers), else
 * this build's own org name, else nothing (the mark alone). Pure apart from
 * the build's environment.
 */
export function publicWorkspaceName(fromServer?: string | null): string | undefined {
  return namedWorkspace(fromServer) || undefined
}

/** The workspace's mark: a tile in its hue holding the ring. */
export function WorkspaceMark({ size = 24, className }: { size?: 16 | 24; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-workspace-mark=""
      className={cn(
        HUE_CLASS[GUEST_HUE],
        "inline-flex shrink-0 items-center justify-center bg-hue text-white",
        size === 24 ? "size-6 rounded-lg" : "size-4 rounded-[5px]",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className={size === 24 ? "size-3.5" : "size-2.5"} fill="none" stroke="currentColor" strokeWidth={size === 24 ? 3.4 : 4}>
        <circle cx="12" cy="12" r="7" />
      </svg>
    </span>
  )
}

export function PublicFrame({
  surface,
  title,
  workspaceName,
  actions,
  header = true,
  fill = false,
  footer,
  reportHref,
  className,
  mainClassName,
  children,
}: PublicFrameProps) {
  const [scrolled, setScrolled] = React.useState(false)
  const name = publicWorkspaceName(workspaceName)
  React.useEffect(() => {
    if (!header) return
    const on = () => setScrolled(window.scrollY > 4)
    on()
    window.addEventListener("scroll", on, { passive: true })
    return () => window.removeEventListener("scroll", on)
  }, [header])

  return (
    <div data-public-frame="" data-fill={fill || undefined} className={cn("public-frame flex w-full flex-col text-ink", fill ? "h-dvh" : "min-h-dvh", className)}>
      <div aria-hidden="true" data-guest-band="" className={cn(HUE_CLASS[GUEST_HUE], "h-1 w-full shrink-0 bg-hue")} />
      {header ? (
        <header
          data-scrolled={scrolled}
          className="public-header sticky top-0 z-10 flex h-[52px] items-center gap-3 px-4 transition-[background-color,box-shadow] sm:h-14 sm:px-6"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <WorkspaceMark />
            {/* Whose page this is, then what it is (G1): the name goes first
                when a phone runs short, the page's title keeps its room. */}
            {name ? (
              <span data-workspace-name="" className="min-w-0 shrink-[2] truncate text-ui font-semibold text-ink">
                {name}
              </span>
            ) : null}
            {title ? (
              <>
                {name ? <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-line-2" /> : null}
                <h1 className="min-w-0 truncate text-ui font-medium text-ink-2">{title}</h1>
              </>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <main className={cn("flex w-full flex-1 flex-col", fill ? "min-h-0 items-stretch" : "items-center", mainClassName)}>{children}</main>
      <footer className={cn("flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 text-meta text-ink-3", fill ? "py-2" : "pb-8 pt-6")}>
        <MadeWithOneCamp surface={surface} />
        {reportHref ? (
          <>
            <span aria-hidden="true">·</span>
            <a href={reportHref} className="hover:text-ink hover:underline">
              Report this page
            </a>
          </>
        ) : null}
        {footer}
      </footer>
    </div>
  )
}

/**
 * The sheet a public page reads on: r16, e2 by default (`shadow-sheet` for a
 * document), entering once from 12 px below. On a phone it is the full-width
 * sheet with no card.
 */
export function PaperCard({
  className,
  children,
  elevation = "e2",
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { elevation?: "e1" | "e2" | "sheet" }) {
  return (
    <div
      data-paper-card=""
      className={cn(
        "content-paper-in w-full bg-sheet sm:rounded-[16px]",
        elevation === "e1" && "sm:shadow-e1",
        elevation === "e2" && "sm:shadow-e2",
        elevation === "sheet" && "sm:shadow-sheet",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}
