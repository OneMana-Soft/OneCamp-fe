"use client"

import * as React from "react"

import { MadeWithOneCamp, type PublicSurface } from "@/components/public/MadeWithOneCamp"
import { cn } from "@/lib/utils/helpers/cn"

import { PublicHeader } from "./publicHeader"

/**
 * The page people outside the workspace see (content.md rule 6): booking, and
 * the guest doc, table, board and project. A finished page, as they judge the
 * product by it signed out:
 * - a 4 px band in the workspace's hue across the top;
 * - the workspace mark and its name (publicWorkspaceName);
 * - `--frame` with the campfire glow at half strength and the grain;
 * - an optional 56 px header, clear until the page scrolls, then the sheet at
 *   85 % with the one blur;
 * - "Made with OneCamp" under the page (MadeWithOneCamp).
 * Content goes in as children, usually on a `PaperCard`.
 */
export interface PublicFrameProps {
  surface: PublicSurface
  /** The page's own title, after the mark in the header ("How we work"). */
  title?: React.ReactNode
  /** The title and its divider from sm up only. */
  titleFromSm?: boolean
  /** The workspace's name beside the mark, when the page knows it. */
  workspaceName?: string
  /** Header content on the right: the permission tag, "Open in OneCamp". */
  actions?: React.ReactNode
  /** Leave the header out (the booking page has none). */
  header?: boolean
  /** No guest band (a published page's cards). */
  band?: boolean
  /** Window-high, its main area scrolling (a live channel's composer docks at the bottom), the credit one line under it. */
  fill?: boolean
  /** Extra footer content after the credit (a time-zone line). */
  footer?: React.ReactNode
  /** "Report this page" link target, when the page has one. */
  reportHref?: string
  /** The credit; off for a member in their own workspace. */
  credit?: boolean
  className?: string
  mainClassName?: string
  children: React.ReactNode
}

export function PublicFrame({
  surface,
  title,
  titleFromSm,
  workspaceName,
  actions,
  header = true,
  band = true,
  fill = false,
  footer,
  reportHref,
  credit = true,
  className,
  mainClassName,
  children,
}: PublicFrameProps) {
  return (
    <div data-public-frame="" data-fill={fill || undefined} className={cn("public-frame flex w-full flex-col text-ink", fill ? "h-dvh" : "min-h-dvh", className)}>
      <PublicHeader title={title} titleFromSm={titleFromSm} workspaceName={workspaceName} actions={actions} header={header} band={band} />
      <main className={cn("flex w-full flex-1 flex-col", fill ? "min-h-0 items-stretch" : "items-center", mainClassName)}>{children}</main>
      {credit || reportHref || footer ? (
        <footer className={cn("flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 text-meta text-ink-3", fill ? "py-2" : "pb-8 pt-6")}>
          {credit && <MadeWithOneCamp surface={surface} />}
          {reportHref ? (
            <>
              {credit && <span aria-hidden="true">·</span>}
              <a href={reportHref} className="hover:text-ink hover:underline">
                Report this page
              </a>
            </>
          ) : null}
          {footer}
        </footer>
      ) : null}
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
