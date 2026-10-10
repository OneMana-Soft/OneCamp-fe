import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * The top of a page: a quiet kicker, a title set in the display face, and
 * at most one line under it that says something the title does not.
 *
 * Pages used to open with a bold sans heading and a filler line such as "Here
 * is a list of your tasks", which is the shape of every admin template. The
 * display face is the product's voice (DESIGN.md), and the kicker gives the
 * page a place (today's date, a team, a count) without another box.
 */
/**
 * The kicker's look, for a line that sits where one would (a way back).
 * 13px muted text in sentence case, as written: "Project · Launch", "Saturday,
 * October 10". It was mono capitals, and mono is for keys and IDs, never for an
 * eyebrow (design direction, "Typefaces"); in capitals it competed with the
 * title it introduces.
 */
export const kicker = "text-xs text-muted-foreground"

export function PageHeader({
  eyebrow,
  title,
  children,
  actions,
  size = "default",
  className,
}: {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  /** The line under the title, the header's full width. Leave it out rather than restate the title. */
  children?: React.ReactNode
  /** Controls on the right, on the title's centre line. */
  actions?: React.ReactNode
  /** `lg` for Home, where the greeting is the page. */
  size?: "default" | "lg"
  className?: string
}) {
  return (
    <header className={cn("space-y-1.5", className)}>
      {eyebrow && <p className={kicker}>{eyebrow}</p>}
      {/* The title and the page's controls share one row, on its centre line.
          The controls used to sit beside the whole block, bottom-aligned: with a
          line under the title they sat level with that line instead, and took
          their width from it, so a project's line ("6 open · 5 due this week ·
          11 done", its health and its goal) was cut short at 1440 with a panel
          open. Narrow (a side panel open, or the page side by side with
          another), the controls drop below the title rather than squeezing it a
          word a line. Their -my-1 keeps a 36px button from making the row taller
          than the title, so every header has the same rhythm with or without
          controls. */}
      <div data-page-title-row="" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h1
          className={cn(
            // No extra tracking: Inter Tight is already set tight, and
            // tracking-tight on top of it ran the words together.
            "min-w-[min(100%,16rem)] flex-1 font-display font-semibold tracking-normal text-foreground text-balance",
            size === "lg" ? "text-3xl" : "text-2xl",
          )}
        >
          {title}
        </h1>
        {actions && <div data-page-actions="" className="-my-1 flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {/* The line under the title has the header's whole width. */}
      {children}
    </header>
  )
}
