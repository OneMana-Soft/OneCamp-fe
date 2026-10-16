"use client"

import * as React from "react"
import type { LucideIcon } from "lucide-react"
import Link from "next/link"
import type { CampHue } from "@/lib/campHue"
import { Tile } from "@/components/ui/graphics/Tile"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * The frame every settings and admin page shares (design v3, admin §1.2):
 *
 * - a 720px column centred in the sheet, 40px from the top and 96px of room
 *   at the foot; the members table, the audit log and the evidence pack opt
 *   into 944px with `wide`, and nothing is wider;
 * - a header of one 36px hue tile (the section's own hue in the strong cut on
 *   its tint, the one hued thing on the page), the title in title-1 and one
 *   line under it at 14/20 ink-2;
 * - actions on the title's centre line, at most one primary sm and some ghost
 *   icon buttons;
 * - the first card 32px under the header.
 *
 * No kicker on a computer: the settings nav says where you are. A phone's top
 * bar names the page, so there the tile and title are for screen readers
 * only; the line under them stays.
 */
export function PageFrameHeader({
  hue,
  icon: Icon,
  title,
  description,
  actions,
  breadcrumb,
  className,
}: {
  hue: CampHue
  icon: LucideIcon | React.ComponentType<{ className?: string }>
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  /** A sub-page's way back: [{label, href}], the last item is the page. */
  breadcrumb?: { label: string; href?: string }[]
  className?: string
}) {
  return (
    <header data-page-header="" className={cn("mb-8", className)}>
      {breadcrumb && breadcrumb.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-3 max-sm:hidden">
          <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {breadcrumb.map((b, i) => (
              <li key={b.label} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden="true" className="text-ink-4">/</span>}
                {b.href && i < breadcrumb.length - 1 ? (
                  <Link href={b.href} className="rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                    {b.label}
                  </Link>
                ) : (
                  <span aria-current={i === breadcrumb.length - 1 ? "page" : undefined} className={i === breadcrumb.length - 1 ? "font-medium text-foreground" : undefined}>
                    {b.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex items-start gap-4">
        <Tile hue={hue} size="header" data-page-tile="" className="max-sm:hidden">
          <Icon />
        </Tile>
        {/* On a phone the top bar names the page and the h1 is for screen
            readers only, so the title row has nothing visible in it but the
            actions: it no longer holds a 36px empty band above the line, and
            the actions come after the line, which they answer. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div data-page-title-row="" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 max-sm:order-2 sm:min-h-9">
            <h1 className="min-w-0 flex-1 text-title-1 text-foreground text-balance max-sm:sr-only">{title}</h1>
            {actions && (
              <div data-page-actions="" className="flex shrink-0 flex-wrap items-center gap-2 max-sm:mt-3">
                {actions}
              </div>
            )}
          </div>
          {description && <p className="max-w-[60ch] text-sm text-muted-foreground text-pretty max-sm:order-1 sm:mt-0.5">{description}</p>}
        </div>
      </div>
    </header>
  )
}

/**
 * The page's column: 720px (944 when `wide`), with the frame's padding. Keyed
 * by the caller on the section, so a section switch fades the new page up 6px
 * over 180ms (§1.6); the global reduced-motion rule makes it a cut.
 */
export function PageFrame({
  wide,
  children,
  className,
}: {
  wide?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-page-frame={wide ? "wide" : "narrow"}
      className={cn("set-page mx-auto w-full px-4 pb-24 pt-6 sm:px-6 sm:pt-10", wide ? "max-w-[944px]" : "max-w-[720px]", className)}
    >
      {children}
    </div>
  )
}
