import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * The top of a page: a quiet mono kicker, a title set in the display face, and
 * at most one line under it that says something the title does not.
 *
 * Pages used to open with a bold sans heading and a filler line such as "Here
 * is a list of your tasks", which is the shape of every admin template. The
 * display face is the product's voice (DESIGN.md), and the kicker gives the
 * page a place (today's date, a team, a count) without another box.
 */
const kicker = "font-mono text-2xs uppercase tracking-wider text-muted-foreground"

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
    <header className={cn("flex items-end justify-between gap-4", className)}>
      <div className="min-w-0 space-y-1.5">
        {eyebrow && <p className={kicker}>{eyebrow}</p>}
        <h1
          className={cn(
            "font-display font-semibold tracking-tight text-foreground text-balance",
            size === "lg" ? "text-3xl" : "text-2xl",
          )}
        >
          {title}
        </h1>
        {children}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}
