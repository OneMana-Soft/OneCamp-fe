import * as React from "react"

import { cn } from "@/lib/utils/helpers/cn"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "field-surface flex min-h-[60px] w-full rounded-md px-2.5 py-2 text-base md:text-sm",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
