import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils/helpers/cn"
import { ix, pressNothing } from "@/lib/ui/interactive"
import { DisabledTipPiece as Tip } from "@/components/ui/disabledTipPiece"

// Design v3 (§3.10). States are the interaction layer's (app/interaction.css);
// busy spins in its own colours; disabled ("not yet") wears the field's look.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-xs font-medium disabled:pointer-events-none aria-busy:pointer-events-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-brand text-brand-foreground shadow-primary [&_.kbd]:h-4 [&_.kbd]:min-w-4 [&_.kbd]:bg-transparent [&_.kbd]:ring-1 [&_.kbd]:ring-inset [&_.kbd]:ring-white/40 [&_.kbd]:text-current [&_.kbd]:shadow-none",
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

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /** Its own action runs: aria-busy, a second press (keys too) blocked, still focusable. */
  busy?: boolean
  /** With `disabled`: why, in a tip, and the button stays focusable (aria-disabled). */
  disabledReason?: string
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, busy, disabled, disabledReason, onClick, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    const reason = disabled ? disabledReason : undefined
    const inert = !!busy || !!reason || props["aria-disabled"] === true || props["aria-disabled"] === "true"
    const tipId = React.useId()
    const button = (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        // The press on a touch screen: app/phone.css F2.
        data-press={size?.startsWith("icon") ? "icon" : "control"}
        // A finger's target is 44px whatever the size (app/phone.css F3).
        data-touch-target=""
        {...ix(size?.startsWith("icon") ? "icon" : variant === "link" ? "link" : variant === "sidebarActive" ? "nav" : "button", {
          tone: variant === "destructive" ? "danger" : !variant || variant === "default" ? "primary" : undefined,
          disabledReason: reason,
        })}
        data-tip-control={reason && tipId}
        disabled={reason ? undefined : disabled}
        aria-busy={busy || undefined}
        onClick={inert ? pressNothing : onClick}
        {...props}
      />
    )
    return <>{button}{reason && <React.Suspense><Tip control={tipId} reason={reason} /></React.Suspense>}</>
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
