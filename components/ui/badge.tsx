import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils/helpers/cn"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
  {
    variants: {
      /**
       * Density. `sm` is the dense inline marker that sits beside a name or a
       * title — the shape a dozen call sites were hand-rolling as
       * "rounded bg-x px-1.5 py-0.5 text-3xs". It uses the named type token
       * rather than an arbitrary value, so it cannot drift from the scale.
       */
      size: {
        default: "px-2.5 py-0.5 text-xs",
        sm: "px-1.5 py-0.5 text-3xs",
      },
      /**
       * Uppercase treatment for short category and status labels. Bundled with
       * its weight and tracking on purpose: those three always travelled
       * together at the call sites, and separating them is how the same label
       * ended up font-medium on one surface, font-semibold on another and
       * font-bold on a third.
       */
      caps: {
        true: "uppercase tracking-wider font-semibold",
        false: "font-medium",
      },
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        soft: "border-transparent bg-primary/10 text-primary hover:bg-primary/20",
        // text-3xs, not text-3xs: the same 10px, but the primitive must not
        // bypass the type token it exists to hand out.
        sidebar: "border-transparent bg-primary text-primary-foreground text-3xs px-1.5 py-0 min-w-[1.2rem] h-5 flex items-center justify-center rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      caps: false,
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

// Every variant axis must be destructured AND forwarded to badgeVariants. Miss
// one and it is silently ignored for styling and then spread onto the <span> as
// an invalid DOM attribute — the failure is invisible in review because the
// prop is accepted by the types and the component still renders.
function Badge({ className, variant, size, caps, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant, size, caps }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
