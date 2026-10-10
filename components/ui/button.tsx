import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils/helpers/cn"

// States, in one place: hover is a fill step, press settles the button down a
// pixel (feedback that the click landed, without a scale that blurs the
// label), keyboard focus is the accent ring, and disabled fades.
//
// Focus on a FILLED button (default, destructive) is a thin outline standing
// 2px off the fill instead. A 2px ring pressed against an orange fill read as
// one thick orange slab, most visibly on the primary button a dialog opens
// with. The gap is what makes the ring read as a ring (web-design-guidelines:
// visible focus; WCAG 2.4.7), and 1.5px keeps it from shouting. Outline, not
// box-shadow, so forced-colours mode still draws it. aria-busy (a caller's loading state)
// dims the label and blocks a second press while the request runs.
// Timing is the house default (120ms, see globals.css), on named properties.
const FILLED_FOCUS =
  "focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-solid focus-visible:outline-[1.5px] focus-visible:outline-offset-2"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,opacity,transform] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-busy:pointer-events-none aria-busy:opacity-70 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 " + FILLED_FOCUS + " focus-visible:outline-ring",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 " + FILLED_FOCUS + " focus-visible:outline-destructive",
        outline:
          "border border-input bg-background hover:bg-highlight hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        // highlight, not accent: --accent is the canvas, so a ghost button in
        // the top bar or sidebar used to "hover" to the colour it sat on.
        ghost: "hover:bg-highlight hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        // The current place: the soft accent ground under ink, the same as
        // .nav-active in globals.css, so a Button and a nav link agree.
        sidebarActive: "bg-brand-muted text-foreground hover:bg-brand-muted",
      },
      size: {
        default: "h-9 px-4 py-2",
        xs: "h-7 rounded-md px-2.5 text-xs",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
