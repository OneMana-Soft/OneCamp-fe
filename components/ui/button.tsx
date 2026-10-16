import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils/helpers/cn"

// Design v3 (§3.10): default (the accent, an inner highlight, 8% darker on
// hover), secondary and outline (raised, e1 to e2), ghost, subtle,
// destructive (danger ink; danger 8% on hover), link. Sizes xs 24 to xl 46;
// icon 32, 28, 24. Press settles half a pixel in 90ms; focus is a 2px accent
// outline 2px off; aria-busy dims it and blocks a second press.
const FOCUS =
  "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-xs font-medium transition-[color,background-color,box-shadow,opacity,translate] duration-[140ms] ease-out active:translate-y-[0.5px] active:duration-[90ms] focus-visible:outline-none " + FOCUS + " disabled:pointer-events-none disabled:opacity-50 aria-busy:pointer-events-none aria-busy:opacity-70 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          // A kbd hint inside it (New task C) is 16px on an 18% white fill.
          "bg-brand text-brand-foreground shadow-primary hover:bg-[color-mix(in_oklab,var(--brand)_92%,black)] [&_.kbd]:h-4 [&_.kbd]:min-w-4 [&_.kbd]:bg-white/[0.18] [&_.kbd]:text-current [&_.kbd]:shadow-none",
        destructive:
          "bg-raised text-danger-ink shadow-e1 hover:bg-[color-mix(in_oklab,var(--destructive)_8%,var(--raised))]",
        outline:
          "bg-raised text-foreground shadow-e1 hover:shadow-e2 active:bg-[color-mix(in_oklab,var(--ink)_7%,var(--raised))]",
        secondary:
          "bg-raised text-foreground shadow-e1 hover:shadow-e2 active:bg-[color-mix(in_oklab,var(--ink)_7%,var(--raised))]",
        ghost: "text-muted-foreground hover:bg-hover hover:text-foreground active:bg-press [&_svg]:text-faint-foreground hover:[&_svg]:text-foreground",
        subtle: "bg-hover text-foreground hover:bg-press active:bg-press",
        link: "text-brand-text underline-offset-[3px] decoration-1 hover:underline",
        // The current place: .nav-active itself (globals.css), the raised chip
        // at e-sel, so a Button and a nav link cannot drift.
        sidebarActive: "nav-active",
      },
      size: {
        default: "h-8 px-3",
        xs: "h-6 rounded-sm px-2 text-2xs",
        sm: "h-7 px-2.5",
        lg: "h-10 px-4 text-sm",
        // The body step by its variables: tailwind-merge reads text-body as a
        // colour and dropped the variant's label colour for it.
        xl: "h-[46px] rounded-[10px] px-5 [font-size:var(--text-body)] [line-height:var(--text-body--line-height)]",
        icon: "h-8 w-8",
        "icon-sm": "h-7 w-7",
        "icon-xs": "h-6 w-6 rounded-sm",
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
        // The press on a touch screen (design v3, mobile F2, app/phone.css):
        // a control dips to .96, an icon button to .92 with the press overlay.
        data-press={size?.startsWith("icon") ? "icon" : "control"}
        // A finger's target is 44px whatever the size (app/phone.css F3).
        data-touch-target=""
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
