import * as React from "react"

import { cn } from "@/lib/utils/helpers/cn"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // h-11 on mobile, h-9 from md up — the same mobile-first split already
          // used for text-base/md:text-sm, and for the same reason: a 36px field
          // is under the 44px touch guidance every mobile platform converges on,
          // while 36px is right for a dense desktop form. Verified in Chromium at
          // a 390px viewport by e2e/designSystem.spec.ts.
          "flex h-11 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base transition-all duration-150 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-ring/60 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50 md:h-9 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
