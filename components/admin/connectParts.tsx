"use client"

/**
 * The connect slice's shared parts (design v3, admin §A14, A16, A18 to A20, S3):
 * the import, workflow, integration, app, webhook and connector screens all
 * draw the same few things, so they are drawn once here.
 *
 * - SourceMark: a tool's mark, monochrome in ink-2 on the sunken surface. A
 *   source is a category, never a hue (§1.5), and we ship no vendor logos, so
 *   it is the vendor's neutral glyph where Lucide has one (GitHub) and its
 *   initial otherwise.
 * - StateWord: a 6px dot and a word (§1.4). "Running" can pulse (opacity only).
 * - NeutralChip: the 22px neutral chip with an ink-3 glyph, for an event, a
 *   token in a sentence, a scope.
 * - ConnectionCard: the r12 e1 card with a 48px header (mark, name, state,
 *   Connect or ⋯) and its linked things as rows under it.
 * - RowMenu: the 32px ⋯ button that opens a row's actions.
 */

import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Github, Link2, MoreHorizontal, type LucideIcon } from "@/lib/icons"

/** The neutral glyphs we have for a vendor; every other one shows its initial. */
const VENDOR_GLYPH: Record<string, LucideIcon> = {
  github: Github,
}

/** "monday" reads "m", as the vendor writes it; everything else is upper case. */
export function sourceInitial(name: string): string {
  const t = name.trim()
  if (!t) return "?"
  if (/^monday/i.test(t)) return "m"
  return t[0].toUpperCase()
}

export type SourceMarkSize = 20 | 28 | 32

/**
 * A tool's mark at 20, 28 or 32px: its neutral glyph or its initial, ink-2 on
 * the sunken surface with a hairline ring. `vendor` is the key ("github",
 * "asana"); `name` is what it is called, for the initial.
 */
export function SourceMark({
  vendor,
  name,
  size = 32,
  className,
  glyph,
}: {
  vendor?: string
  name: string
  size?: SourceMarkSize
  className?: string
  /** A neutral glyph of the thing's kind (a mail, a calendar) where two would share an initial. */
  glyph?: LucideIcon
}) {
  const Glyph = glyph ?? (vendor ? VENDOR_GLYPH[vendor.toLowerCase()] : undefined)
  return (
    <span
      aria-hidden="true"
      data-source-mark={vendor ?? name}
      data-size={size}
      className={cn("cx-mark", className)}
    >
      {Glyph ? <Glyph /> : sourceInitial(name)}
    </span>
  )
}

export type StateTone = "success" | "warning" | "danger" | "neutral" | "info"

/**
 * A state as a 6px dot and a word (13/510): "Connected" moss, "Running" sun,
 * "Failing" danger, "Off" ink-3. `pulse` breathes the dot (opacity only) while
 * something is running; reduced motion stills it.
 */
export function StateWord({
  tone,
  children,
  pulse,
  className,
  dotRef,
}: {
  tone: StateTone
  children: React.ReactNode
  pulse?: boolean
  className?: string
  /** The dot itself, for a celebration or a morph to start from. */
  dotRef?: React.Ref<HTMLSpanElement>
}) {
  return (
    <span data-state-word={tone} className={cn("cx-state", className)}>
      <span ref={dotRef} aria-hidden="true" data-tone={tone} data-pulse={pulse ? "true" : undefined} className="cx-dot" />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  )
}

/** The 22px neutral chip: a 14px ink-3 glyph and the words. */
export function NeutralChip({
  icon: Icon,
  children,
  className,
  title,
}: {
  icon?: LucideIcon
  children: React.ReactNode
  className?: string
  title?: string
}) {
  return (
    <span data-neutral-chip="" title={title} className={cn("cx-chip", className)}>
      {Icon && <Icon aria-hidden="true" />}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  )
}

export interface RowMenuItem {
  label: string
  onSelect: () => void
  icon?: LucideIcon
  destructive?: boolean
  disabled?: boolean
  /** Draws a separator above this item. */
  separated?: boolean
}

/** A row's actions behind a 32px ⋯ (44px on a phone), named for the thing it acts on. */
export function RowMenu({ label, items, className }: { label: string; items: RowMenuItem[]; className?: string }) {
  if (items.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={label} className={cn("size-11 md:size-8", className)}>
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {items.map((it) => (
          <React.Fragment key={it.label}>
            {it.separated && <DropdownMenuSeparator />}
            <DropdownMenuItem
              disabled={it.disabled}
              onSelect={it.onSelect}
              className={cn(it.destructive && "text-danger-ink focus:text-danger-ink")}
            >
              {it.icon && <it.icon aria-hidden="true" />}
              {it.label}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * A connection (§A18): the r12 e1 card with a 48px header (the vendor's mark at
 * 32 on sunken, its name at 15/590, a state, and on the right Connect or ⋯),
 * then its body: the linked things as rows, a banner, a form.
 */
export function ConnectionCard({
  id,
  mark,
  name,
  state,
  action,
  children,
  className,
  level = 3,
  "aria-label": ariaLabel,
}: {
  id?: string
  /** The name's heading level: 2 where the card sits straight under the page's h1. */
  level?: 2 | 3
  mark: React.ReactNode
  name: React.ReactNode
  state?: React.ReactNode
  /** Connect (primary sm) when not connected, a RowMenu when it is. */
  action?: React.ReactNode
  children?: React.ReactNode
  className?: string
  "aria-label"?: string
}) {
  const Heading = level === 2 ? "h2" : "h3"
  return (
    <section id={id} aria-label={ariaLabel} data-connection-card="" className={cn("cx-conn scroll-mt-5", className)}>
      <header className="cx-conn-head">
        {mark}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-0.5">
          {/* The size and the colour on different elements: cn would drop text-heading. */}
          <Heading className="min-w-0 truncate text-heading">{name}</Heading>
          {state}
        </div>
        {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
      </header>
      {children}
    </section>
  )
}

/** A thing a connection links: "kestrel/harbourline-app → Harbourline mobile app", with a 12px link glyph. */
export function LinkedRow({
  from,
  to,
  meta,
  action,
}: {
  from: React.ReactNode
  to?: React.ReactNode
  meta?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div data-linked-row="" className="cx-linked">
      <Link2 aria-hidden="true" className="cx-linked-glyph" />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm">
          <span className="min-w-0 truncate font-medium text-foreground">{from}</span>
          {to && (
            <>
              <span aria-hidden="true" className="text-ink-3">
                →
              </span>
              <span className="min-w-0 truncate text-foreground">{to}</span>
            </>
          )}
        </p>
        {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
    </div>
  )
}
