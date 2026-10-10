import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { LucideIcon } from "lucide-react";

/**
 * Emphasis of an empty state. Not decoration — it answers "is this space empty
 * because nothing happened yet, or because the user hasn't set the thing up?"
 *
 *  - "muted" (default): a small muted icon and small copy. For an empty list or
 *    panel sitting inside a busier surface, where the empty state is a footnote
 *    and shouldn't outshout the chrome around it.
 *  - "accent": a larger icon, a larger title and body-size copy. For a card or page
 *    whose entire job right now is to invite the first action — no agents, no
 *    tables, no connected servers. This is the presentation four admin cards and
 *    two full pages had each hand-rolled as ~14 identical lines of markup.
 *
 * The two tones exist so dense surfaces stop opting out of the primitive by
 * copy-pasting their own block, which is how the codebase ended up with both
 * idioms and no single place to change either.
 */
type EmptyStateTone = "muted" | "accent"

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  /**
   * ReactNode rather than string: several empty states need emphasis inside the
   * sentence — "Click <strong>New import</strong>…", a path in <em> — and while
   * that was only a string away, those callers kept their own hand-rolled block
   * instead of adopting the primitive. Widening the type is what lets them in.
   */
  description?: React.ReactNode
  /** The one next step. One: an empty state with two buttons asks the
   *  person to make a decision before they have anything to decide about. */
  action?: React.ReactNode
  className?: string
  /**
   * Classes for the description line, usually its width. The default is a
   * readable measure (45ch); a page-level empty state can widen it, a narrow
   * panel can tighten it. tailwind-merge lets the caller's max-w win.
   */
  descriptionClassName?: string
  tone?: EmptyStateTone
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  descriptionClassName,
  tone = "muted",
}: EmptyStateProps) {
  const accent = tone === "accent"
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-center",
        // Horizontal padding differs by tone because the accent copy is wider
        // (max-w-sm vs 45ch); px-6 on a 360px screen would cost it a
        // line. Callers override either via className — cn is tailwind-merge.
        accent ? "px-4 py-12" : "px-6 py-12",
        className
      )}
    >
      {/* The icon stands on its own, in muted ink. It used to sit in a grey
          circle (muted) or an orange tile (accent): an icon in a tinted chip
          is the most recognisable shape of a templated UI, and the orange one
          spent the accent on an illustration rather than on the action under
          it (design direction: "never put an icon inside a tinted chip").
          The accent tone is now carried by scale, not colour. */}
      {Icon && (
        <Icon
          aria-hidden="true"
          data-empty-icon=""
          className={cn("shrink-0 text-muted-foreground", accent ? "size-7" : "size-5")}
          strokeWidth={1.5}
        />
      )}
      <div className={cn("space-y-1", accent && "max-w-sm")}>
        <h3 className={cn("font-medium text-foreground text-balance", accent ? "text-base" : "text-sm")}>{title}</h3>
        {description && (
          <p
            className={cn(
              // pretty: no sentence ends on a word alone on its last line.
              "text-muted-foreground text-pretty",
              // 45ch, not a fixed 260px: 260px was a sidebar's width, and on a
              // page it broke a two-line sentence into four.
              accent ? "text-sm" : "text-xs max-w-[45ch]",
              descriptionClassName
            )}
          >
            {description}
          </p>
        )}
      </div>
      {/* gap-3 already separates the action in the accent layout; the extra
          mt-1 is kept only for the muted tone so existing callers don't shift. */}
      {action && <div className={cn(!accent && "mt-1")}>{action}</div>}
    </div>
  )
}
