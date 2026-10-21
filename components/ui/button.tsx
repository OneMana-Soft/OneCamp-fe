import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils/helpers/cn"
import { ix } from "@/lib/ui/interactive"

// Design v3 (§3.10). States are the interaction layer's (app/interaction.css);
// aria-busy dims it and blocks a second press.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-xs font-medium disabled:pointer-events-none aria-busy:pointer-events-none aria-busy:opacity-70 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          // A kbd hint inside it (New task C) is 16px on an 18% white fill.
          "bg-brand text-brand-foreground shadow-primary [&_.kbd]:h-4 [&_.kbd]:min-w-4 [&_.kbd]:bg-white/[0.18] [&_.kbd]:text-current [&_.kbd]:shadow-none",
        destructive: "bg-raised text-danger-ink shadow-e1",
        outline: "bg-raised text-foreground shadow-e1 hover:shadow-e2",
        secondary: "bg-raised text-foreground shadow-e1 hover:shadow-e2",
        ghost: "text-muted-foreground hover:text-foreground [&_svg]:text-faint-foreground hover:[&_svg]:text-foreground",
        subtle: "bg-hover text-foreground",
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

// Why it is disabled, in the portalled tooltip, fetched when first needed.
const Tip = React.lazy(() => import("./disabledTip"))

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** With `disabled`: why, in a tip, and the button stays focusable (aria-disabled). */
  disabledReason?: string
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, disabled, disabledReason, onClick, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    const reason = disabled ? disabledReason : undefined
    const inert = !!reason || props["aria-disabled"] === true || props["aria-disabled"] === "true"
    const button = (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        // The press on a touch screen (design v3, mobile F2, app/phone.css):
        // a control dips to .96, an icon button to .92 with the press overlay.
        data-press={size?.startsWith("icon") ? "icon" : "control"}
        // A finger's target is 44px whatever the size (app/phone.css F3).
        data-touch-target=""
        {...ix(size?.startsWith("icon") ? "icon" : variant === "link" ? "link" : variant === "sidebarActive" ? "nav" : "button", {
          tone: variant === "destructive" ? "danger" : !variant || variant === "default" ? "primary" : undefined,
          disabledReason: reason,
        })}
        disabled={reason ? undefined : disabled}
        onClick={
          inert
            ? (e: React.MouseEvent<HTMLButtonElement>) => {
                e.preventDefault()
                e.stopPropagation()
              }
            : onClick
        }
        {...props}
      />
    )
    return reason ? <React.Suspense fallback={button}><Tip reason={reason}>{button}</Tip></React.Suspense> : button
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
