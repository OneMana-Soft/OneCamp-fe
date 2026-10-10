"use client"

import * as React from 'react'
import type { TooltipContentProps } from '@radix-ui/react-tooltip'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Toggle } from '@/components/ui/toggle'
import { cn } from '@/lib/utils/helpers/cn'

interface ToolbarButtonProps extends React.ComponentPropsWithoutRef<typeof Toggle> {
  isActive?: boolean
  tooltip?: string
  tooltipOptions?: TooltipContentProps
}

export const ToolbarButton = React.forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  ({ isActive, children, tooltip, className, tooltipOptions, ...props }, ref) => {
    // On is the editor's state, not the toggle's own: `pressed` follows it, so
    // a screen reader hears "Bold, pressed" when the caret is in bold text.
    // The on look is set here too, because the tooltip that wraps the button
    // takes over its data-state, so Toggle's own on style never showed; and
    // it is surface-3, since bg-accent is the canvas a toolbar sits next to.
    const toggleButton = (
      <Toggle
        size="sm"
        ref={ref}
        {...(isActive === undefined ? {} : { pressed: isActive })}
        className={cn('size-8 p-0', isActive ? 'bg-highlight text-foreground' : 'text-muted-foreground', className)}
        {...props}
      >
        {children}
      </Toggle>
    )

    if (!tooltip) {
      return toggleButton
    }

    return (
      <Tooltip>
        <TooltipTrigger asChild>{toggleButton}</TooltipTrigger>
        <TooltipContent {...tooltipOptions}>
          <div className="flex flex-col items-center text-center">{tooltip}</div>
        </TooltipContent>
      </Tooltip>
    )
  }
)

ToolbarButton.displayName = 'ToolbarButton'

export default ToolbarButton
