"use client"

// One dock control and the words every control says (C7): shared by the
// call's dock (VideoControls) and the green room (PreJoin), and its own file
// so the green room's first load has them without the call's dock.

import * as React from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils/helpers/cn"
import { springPop } from "@/lib/spring"
import { CONTROL_KEYS } from "./callKeys"

/**
 * The words every control says, shared with the green room (PreJoin), so a
 * control never changes its name between the two screens.
 */
export const CONTROL_LABELS = {
  mute: "Mute",
  unmute: "Unmute",
  cameraOff: "Turn camera off",
  cameraOn: "Turn camera on",
} as const

/** The keys the tooltips teach, from the one table the handlers answer (callKeys). */
export { CONTROL_KEYS }

export type DockState = "on" | "off" | "active"

/**
 * A dock button's look per state (C7). Off is a circle as well as a colour:
 * the radius morphs from 12 to 22 on the M3 emphasized curve, so the state
 * never rests on colour alone. Active toggles invert to a light chip.
 */
export const DOCK_STATE_CLASS: Record<DockState, string> = {
  on: "rounded-[12px] bg-[#2A2B30] text-[#EEEEF0] hub-hl-top hover:bg-[#34353B]",
  off: "rounded-[22px] bg-[#3A1518] text-[#FF8086] hover:bg-[#45191D]",
  active: "rounded-[12px] bg-[#EEEEF0] text-[#0B0C0E] hover:bg-white",
}

export const DOCK_BUTTON =
  "relative grid size-12 shrink-0 place-items-center transition-[border-radius,background-color,color,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:pointer-events-none disabled:opacity-40 aria-disabled:opacity-40 @3xl:size-11 [&_svg]:size-5"

interface DockButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: string
  /** The short word under the button: on a phone, and on a stage of 1280 px or more. */
  short?: string
  shortcut?: string
  state?: DockState
  icon: React.ReactNode
  /** A device menu, as the attached chevron segment. */
  menu?: React.ReactNode
  pressed?: boolean
  badge?: React.ReactNode
  /** The tooltip's words in place of the name and key: why the control can't work here. */
  hint?: string
  /**
   * Wraps the button, for a control that opens a menu (Share's: a screen or
   * a board): the caller's DropdownMenuTrigger, so this file, which the green
   * room's first load shares, never loads a menu.
   */
  trigger?: (button: React.ReactElement) => React.ReactElement
}

/**
 * A control's word under it: on a phone, where the bar has room for five,
 * and again on a stage of 1280 px or more, as Zoom's says each control's name.
 * Between those widths the tooltip says it.
 */
export function DockWord({ children }: { children: React.ReactNode }) {
  return (
    <span data-dock-word="" className="text-micro font-medium leading-none text-ink-2 @3xl:hidden @7xl:block">
      {children}
    </span>
  )
}

/** One dock control: 44px, a 20px icon, its state as shape and colour, its name and key in the tooltip. */
export function DockButton({ label, short, shortcut, state = "on", icon, menu, pressed, badge, hint, trigger, className, onClick, ...rest }: DockButtonProps) {
  const iconRef = React.useRef<HTMLSpanElement>(null)
  const button = (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      data-dock-state={state}
      className={cn(DOCK_BUTTON, DOCK_STATE_CLASS[state], menu && "@3xl:rounded-r-none", className)}
      onClick={(e) => {
        // The icon springs on a toggle; never on load.
        springPop(iconRef.current)
        onClick?.(e)
      }}
      {...rest}
    >
      <span ref={iconRef} className="grid place-items-center">
        {icon}
      </span>
    </button>
  )
  return (
    <span className="flex flex-col items-center gap-1" data-dock-control="">
      <span className="relative flex">
        <Tooltip>
          <TooltipTrigger asChild>{trigger ? trigger(button) : button}</TooltipTrigger>
          <TooltipContent className="flex items-center gap-1.5">
            {hint ?? label}
            {shortcut && !hint ? <kbd className="kbd">{shortcut}</kbd> : null}
          </TooltipContent>
        </Tooltip>
        {menu ? <span className="hidden @3xl:flex">{menu}</span> : null}
        {badge}
      </span>
      {short ? <DockWord>{short}</DockWord> : null}
    </span>
  )
}
