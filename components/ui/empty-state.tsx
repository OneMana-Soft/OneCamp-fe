import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { LucideIcon } from "lucide-react";

/**
 * Emphasis of an empty state. Not decoration — it answers "is this space empty
 * because nothing happened yet, or because the user hasn't set the thing up?"
 *
 *  - "muted" (default): a quiet grey circle and small copy. For an empty list or
 *    panel sitting inside a busier surface, where the empty state is a footnote
 *    and shouldn't outshout the chrome around it.
 *  - "accent": a primary-tinted tile and body-size copy. For a card or page
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
  action?: React.ReactNode
  className?: string
  tone?: EmptyStateTone
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  tone = "muted",
}: EmptyStateProps) {
  const accent = tone === "accent"
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-center",
        // Horizontal padding differs by tone because the accent copy is wider
        // (max-w-sm vs max-w-[260px]); px-6 on a 360px screen would cost it a
        // line. Callers override either via className — cn is tailwind-merge.
        accent ? "px-4 py-12" : "px-6 py-12",
        className
      )}
    >
      {Icon && (
        <div
          className={cn(
            "flex items-center justify-center",
            accent
              ? "h-12 w-12 rounded-2xl bg-primary/10"
              : "rounded-full bg-muted p-3"
          )}
        >
          <Icon
            className={cn("size-6", accent ? "text-primary" : "text-muted-foreground")}
            strokeWidth={accent ? 2 : 1.5}
          />
        </div>
      )}
      <div className={cn("space-y-1", accent && "max-w-sm")}>
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {description && (
          <p
            className={cn(
              "text-muted-foreground",
              accent ? "text-sm" : "text-xs max-w-[260px]"
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
