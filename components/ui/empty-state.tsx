import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { LucideIcon } from "lucide-react";
import type { CampHue } from "@/lib/campHue"
import { Tile } from "@/components/ui/graphics/Tile"

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
  /**
   * A spot illustration (components/ui/graphics, the playful layer) above the
   * heading, in place of the icon: <SpotInbox hue="sky" />. When both are
   * given the illustration wins. The tone sizes it, 64px muted and 96px
   * accent, whatever size the spot was given, and it is decorative: the
   * heading says what is empty. A spot is a whole drawing, not an icon in a
   * tinted chip, so the rule below still holds.
   */
  illustration?: React.ReactNode
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
  /**
   * The title's heading level, so the empty state sits right in the page's
   * outline: 1 when it is the whole page (an error page), 2 when it is the
   * page's main content under the page title, 3 (the default, as before)
   * inside a section, 4 inside a card in a section.
   */
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6
  tone?: EmptyStateTone
  /**
   * A camp hue for the icon's tile (the playful layer: icons in empty states
   * sit on a hued tint tile). Take the hue of the section the empty state is
   * in, so a section keeps one colour. Without it the icon stands bare.
   */
  hue?: CampHue
}

export function EmptyState({
  icon: Icon,
  illustration,
  title,
  description,
  action,
  className,
  descriptionClassName,
  headingLevel = 3,
  tone = "muted",
  hue,
}: EmptyStateProps) {
  const accent = tone === "accent"
  const Heading = `h${headingLevel}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
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
      {/* In order: a spot illustration, sized by the tone; otherwise an icon
          with a hue, on that hue's tint tile (the playful layer), in a camp
          colour and never the accent, which belongs to the action under it;
          otherwise the icon on its own, in muted ink, as after the calm pass
          of 10 Oct. */}
      {illustration ? (
        <div
          aria-hidden="true"
          data-empty-illustration=""
          className={cn("shrink-0", accent ? "[&>svg]:size-24" : "[&>svg]:size-16")}
        >
          {illustration}
        </div>
      ) : Icon && hue ? (
        <Tile hue={hue} size={accent ? "lg" : "md"}>
          <Icon aria-hidden="true" data-empty-icon="" strokeWidth={1.5} />
        </Tile>
      ) : Icon ? (
        <Icon
          aria-hidden="true"
          data-empty-icon=""
          className={cn("shrink-0 text-muted-foreground", accent ? "size-7" : "size-5")}
          strokeWidth={1.5}
        />
      ) : null}
      <div className={cn("space-y-1", accent && "max-w-sm")}>
        <Heading className={cn("font-medium text-foreground text-balance", accent ? "text-base" : "text-sm")}>{title}</Heading>
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
