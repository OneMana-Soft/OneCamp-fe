"use client"

/**
 * THE HUBROW (design v3, hub.md §1.2): one row anatomy for every list in the
 * hub, where there were six: Home's rows, the needs-me rows, Activity, Later,
 * search results and the inbox.
 *
 *   compact   36px (44 on touch), a 24px glyph, one line. Recent, Create, the palette.
 *   two-line  52px (60 on touch), a 24px glyph or 28px avatar, a title and a
 *             meta line. Needs-me, Later, recordings, search.
 *   feed      64px and up, a 32px avatar with a kind badge, a sentence and a
 *             preview. Activity, the agents record, inbox threads.
 *
 * The grid is [unread gutter 12][lead][12][content][meta]. Unread is a 6px
 * brand dot in the gutter and nothing else, so marking a row read moves
 * nothing. The hover toolbar replaces the meta on hover and focus. The look is
 * app/hub.css; a row that opens something is a row of the interaction layer
 * (its hover, press, focus and selected states); this file is the structure.
 */
import * as React from "react"

import { MoreHorizontal } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { ix } from "@/lib/ui/interactive"
import { useTouchReveal } from "@/hooks/useTouchReveal"
import type { ResolvePhase } from "@/lib/hub/motion"

export type HubRowDensity = "compact" | "two-line" | "feed"

export interface HubRowProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  density: HubRowDensity
  /** The lead column: a glyph, an avatar, an agent square. */
  lead?: React.ReactNode
  /** Its width when it is not the density's own (28 for a two-line avatar, 40 for a thumbnail). */
  leadSize?: 24 | 28 | 32 | 40
  title: React.ReactNode
  /** The second line: meta for two-line, the preview for feed. */
  second?: React.ReactNode
  /** The right edge at rest: a time, a pill. */
  meta?: React.ReactNode
  /** The hover toolbar (HubToolbar), shown on hover and focus in place of the meta. */
  tools?: React.ReactNode
  /** Undefined for a list with no read state; true or false for one that has it. */
  unread?: boolean
  selected?: boolean
  disabled?: boolean
  /** The resolve recipe's phase (lib/hub/motion useResolve). */
  resolve?: ResolvePhase
  /** Matches the row across a FLIP. */
  flipKey?: string
  /** Something under the row's content (an inline composer, evidence). */
  children?: React.ReactNode
  /** Render as a link or a button rather than a div. */
  as?: "div" | "a" | "button" | "li"
  href?: string
  /**
   * The row opens through a control stretched over it (its title's link or
   * button): it is a row of the interaction layer as one that is itself a
   * link is, tinting under the pointer and pressing (SH-29, SH-30). A row
   * whose only control is its title stays a quiet list item.
   */
  opens?: boolean
  /** The keyboard's place in a list whose focus stays elsewhere (Mail's j and k): an inset ring, unlike selected. */
  cursor?: boolean
}

export const HubRow = React.forwardRef<HTMLElement, HubRowProps>(function HubRow(
  {
    density,
    lead,
    leadSize,
    title,
    second,
    meta,
    tools,
    unread,
    selected,
    disabled,
    resolve,
    flipKey,
    children,
    as = "div",
    opens,
    cursor,
    className,
    onClick,
    onFocus,
    onBlur,
    ...rest
  },
  ref,
) {
  const Tag = as as React.ElementType
  const interactive = Boolean(onClick || opens || as === "a" || as === "button" || rest.href)
  // A screen that can't hover reaches the toolbar through the row's Actions
  // button (app/hub.css), as a message reaches its own: the one reveal
  // (hooks/useTouchReveal), its host on the row and its toggle on Actions.
  const reveal = useTouchReveal()
  const host = tools ? reveal.hostProps : undefined
  return (
    <Tag
      ref={ref}
      data-hub-row=""
      data-density={density}
      data-lead={leadSize && leadSize !== 24 && leadSize !== 32 ? String(leadSize) : undefined}
      data-interactive={interactive ? "row" : undefined}
      data-selected={selected ? "true" : undefined}
      data-disabled={disabled ? "" : undefined}
      data-has-tools={tools ? "" : undefined}
      data-reveal={tools ? "tap" : undefined}
      data-revealed={host?.["data-revealed"]}
      data-unread={unread ? "" : undefined}
      data-resolve={resolve}
      data-flip-key={flipKey}
      aria-disabled={disabled || undefined}
      onClick={onClick}
      onFocus={(e: React.FocusEvent<HTMLElement>) => {
        // Keyboard focus in the row shows its tools on a touch screen too, and
        // keeps them while Tab walks through them.
        host?.onFocus(e)
        onFocus?.(e)
      }}
      onBlur={(e: React.FocusEvent<HTMLElement>) => {
        // Gone from the row, and not into a tool's own menu or dialog.
        host?.onBlur(e)
        onBlur?.(e)
      }}
      className={cn("hub-row group/hubrow", resolve === "leaving" && "hub-resolve-out", className)}
      {...rest}
    >
      <span className="hub-row-gutter" aria-hidden>
        {unread !== undefined ? <span className="hub-unread-dot" data-read={unread ? undefined : ""} /> : null}
      </span>
      <span className="hub-row-lead">{lead}</span>
      <span className="min-w-0">
        <span
          className={cn(
            "block min-w-0 truncate",
            density === "compact" && "text-ui font-book",
            density === "two-line" && "text-ui font-medium",
            // A phone's feed row may take two lines (A4): on one, "Jonas
            // Weber mentioned you in #acme" lost the place, and an agent's
            // entry its Refused or Drill tag.
            density === "feed" && "text-ui text-ink-2 max-sm:line-clamp-2 max-sm:whitespace-normal",
          )}
        >
          {title}
        </span>
        {second ? (
          <span
            className={cn(
              "mt-px block min-w-0 truncate",
              density === "two-line" && "text-meta text-ink-3",
              density === "feed" && "text-ui-sm leading-5 text-ink-2",
            )}
          >
            {second}
          </span>
        ) : null}
        {children}
      </span>
      {meta !== undefined && meta !== null ? <span className="hub-row-meta">{meta}</span> : <span />}
      {cursor ? <span aria-hidden="true" data-kbd-cursor="" className="pointer-events-none absolute inset-0.5 rounded-md ring-cursor" /> : null}
      {tools ? (
        // Shown only where nothing can hover (app/hub.css): the way to the
        // tools under a finger. Never the row's own tap, which opens the row.
        <button
          type="button"
          className="hub-row-more"
          data-touch-target=""
          aria-label="Actions"
          {...reveal.toggleProps}
        >
          <MoreHorizontal aria-hidden />
        </button>
      ) : null}
      {tools ? (
        <span className="hub-row-tools" onClick={(e) => e.stopPropagation()}>
          {tools}
        </span>
      ) : null}
    </Tag>
  )
})

/** A 24px icon button for a HubRow's toolbar, with its name as the tooltip. */
export function HubToolButton({
  label,
  shortcut,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; shortcut?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      data-touch-target=""
      {...ix("icon")}
      className={cn(
        "grid size-6 place-items-center rounded-sm text-ink-3 hover:text-foreground [&_svg]:size-3.5",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/** A row-shaped skeleton: a lead disc or tile, a 60% title bar and a 40% meta bar. */
export function HubRowSkeleton({ density, tile = false }: { density: HubRowDensity; tile?: boolean }) {
  const lead = density === "feed" ? 32 : 24
  return (
    <div className="hub-row" data-density={density} data-hub-skeleton="" aria-hidden>
      <span />
      <span className="hub-row-lead">
        <span className={cn("block animate-shimmer bg-press", tile ? "rounded-[7px]" : "rounded-full")} style={{ width: lead, height: lead }} />
      </span>
      <span className="min-w-0 space-y-2">
        <span className="block h-3 w-3/5 animate-shimmer rounded-sm bg-press" />
        {density !== "compact" ? <span className="block h-2.5 w-2/5 animate-shimmer rounded-sm bg-press" /> : null}
      </span>
      <span />
    </div>
  )
}

/** An action a finger can take: the base touch rule's 44px (app/phone.css F3) on its own element. */
function touchTarget(action: React.ReactNode): React.ReactNode {
  if (!React.isValidElement(action) || action.type === React.Fragment) return action
  return React.cloneElement(action as React.ReactElement<Record<string, unknown>>, { "data-touch-target": "" })
}

/** The hub's section header (H21): a 13/590 h2, a count, an action with no arrow. */
export function HubSectionHeader({
  title,
  count,
  action,
  id,
  className,
}: {
  title: React.ReactNode
  count?: React.ReactNode
  action?: React.ReactNode
  id?: string
  className?: string
}) {
  return (
    <div className={cn("hub-section-head", className)}>
      <h2 id={id} className="text-ui-sm font-semibold text-foreground">
        {title}
      </h2>
      {count !== undefined && count !== null ? <span className="text-meta font-book text-ink-3 tabular-nums">{count}</span> : null}
      {action ? <span className="ml-auto text-meta font-book text-ink-3 [&_a:hover]:text-foreground [&_button:hover]:text-foreground">{touchTarget(action)}</span> : null}
    </div>
  )
}
