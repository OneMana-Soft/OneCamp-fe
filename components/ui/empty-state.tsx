import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { LucideIcon } from "lucide-react";
import type { MarkHue } from "./graphics/hues"
import { Tile } from "@/components/ui/graphics/Tile"

/**
 * "muted" (the default) is a footnote in a busier surface; "accent" is a card
 * or page whose one job is the first action. Two tones, so a dense surface
 * never hand-rolls its own block.
 */
type EmptyStateTone = "muted" | "accent"

interface EmptyStateProps {
  icon?: LucideIcon
  /** A spot (components/ui/graphics) in place of the icon, sized by the tone; decorative, as the title says what is empty. */
  illustration?: React.ReactNode
  title: string
  /** A node, so the sentence can hold "<strong>New import</strong>". */
  description?: React.ReactNode
  /** The one next step: two would ask for a decision before there is one to make. */
  action?: React.ReactNode
  className?: string
  /** The description's classes, usually its width (45ch); the caller's max-w wins. */
  descriptionClassName?: string
  /** The title's level in the page's outline: 1 a whole page, 2 its main content, 3 a section, 4 a card. */
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6
  tone?: EmptyStateTone
  /** The section's camp hue, for the icon's tint tile; without it the icon stands bare. */
  hue?: MarkHue
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
        // The accent's copy is wider (max-w-sm): px-6 would cost it a line at 360px.
        accent ? "px-4 py-12" : "px-6 py-12",
        className
      )}
    >
      {/* A spot; else the icon on its hue's tile (a camp colour: the accent is the action's); else the icon in muted ink. */}
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
              // 45ch: a fixed 260px broke a page's two-line sentence into four.
              accent ? "text-sm" : "text-xs max-w-[45ch]",
              descriptionClassName
            )}
          >
            {description}
          </p>
        )}
      </div>
      {/* gap-3 spaces the accent's action; mt-1 keeps the muted tone's callers where they were. */}
      {action && <div className={cn(!accent && "mt-1")}>{action}</div>}
    </div>
  )
}
