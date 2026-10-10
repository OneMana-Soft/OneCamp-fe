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
  /** The line under the title. Leave it out rather than restate the title. */
  children?: React.ReactNode
  /** Controls on the right, level with the title. */
  actions?: React.ReactNode
  /** `lg` for Home, where the greeting is the page. */
  size?: "default" | "lg"
  className?: string
}) {
  return (
    // Narrow (a side panel open, or the page side by side with another): the
    // controls drop below the title rather than squeezing it a word a line.
    <header className={cn("flex flex-wrap items-end justify-between gap-x-4 gap-y-3", className)}>
      <div className="min-w-[min(100%,16rem)] flex-1 space-y-1.5">
        {eyebrow && <p className={kicker}>{eyebrow}</p>}
        <h1
          className={cn(
            // No extra tracking: Inter Tight is already set tight, and
            // tracking-tight on top of it ran the words together.
            "font-display font-semibold tracking-normal text-foreground text-balance",
            size === "lg" ? "text-3xl" : "text-2xl",
          )}
        >
          {title}
        </h1>
        {children}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
