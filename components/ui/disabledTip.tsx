"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { TooltipContent } from "@/components/ui/tooltip"

/**
 * Why a control is disabled, in the app's tooltip (18 Oct 2026): portalled to
 * the body, so no clip around the control cuts it, and kept on screen by its
 * collision handling. It opens under the pointer after the tooltips' 400 ms
 * and at once with keyboard focus; the control stays focusable
 * (aria-disabled) and names it (aria-describedby).
 *
 * The reason was a CSS ::after centred above its control (bbe10852e), and any
 * overflow clip around the control cut it: in the new-task dialog the Attach
 * tip read "a project first", and the top row of a read-only list read
 * "project's members can change it".
 *
 * Button (disabledReason) and TaskCheck load this lazily, so no route's first
 * load carries a tooltip for a control that may never be disabled. Its own provider, as Button sits on pages without the
 * app's.
 */
export default function DisabledTip({ reason, children }: { reason: string; children: React.ReactElement }) {
  return (
    <TooltipPrimitive.Provider delayDuration={400} skipDelayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipContent className="max-w-[240px] text-center">{reason}</TooltipContent>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}
