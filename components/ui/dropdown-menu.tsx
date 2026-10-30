"use client"

import * as React from "react"
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { Slot } from "@radix-ui/react-slot"
import { ChevronRight } from "@/lib/icons";

import { cn } from "@/lib/utils/helpers/cn"
import { ix } from "@/lib/ui/interactive"
import { movingPointerOnly } from "@/lib/ui/stillPointer"
import { MenuCheck } from "@/components/ui/menuCheck"
import { useFloatRef } from "@/components/ui/floatMark"
import { useSheetMode } from "@/components/ui/overlayMode"
import { lazyPiece } from "@/lib/lazy/lazyPiece";

const DropdownMenu = DropdownMenuPrimitive.Root

// Radix opens a menu on pointerdown. On a phone (overlayMode's SHEET_QUERY) it is a sheet
// rising under the finger, whose release chose a row there; so it opens on the click.
// A menu that joins on a press (components/ui/menuOnDemand) opens through it too.
export function Press({ onPointerDown, onClick, ...props }: React.ComponentProps<typeof Slot>) {
  const held = React.useRef(false)
  return (
    <Slot
      {...props}
      onPointerDown={(e) => {
        held.current = !e.defaultPrevented && !props["aria-expanded"] && !!window.matchMedia?.("(max-width: 639px), (pointer: coarse) and (max-height: 500px)").matches
        if (held.current) e.preventDefault()
        else onPointerDown?.(e)
      }}
      onClick={(e) => {
        onClick?.(e)
        if (held.current && !e.defaultPrevented) onPointerDown?.(e as never)
        held.current = false
      }}
    />
  )
}

const DropdownMenuTrigger = ({ asChild, children, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) => (
  <DropdownMenuPrimitive.Trigger asChild {...props}>
    <Press>{asChild ? children : <button>{children}</button>}</Press>
  </DropdownMenuPrimitive.Trigger>
)

const DropdownMenuGroup = DropdownMenuPrimitive.Group

const DropdownMenuSub = DropdownMenuPrimitive.Sub

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean
  }
>(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      "flex gap-2 select-none items-center rounded-md px-2 py-1.5 text-sm [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&>svg]:mr-0",
      inset && "pl-8",
      className
    )}
    {...ix("item")}
    data-text-value={props.textValue}
    {...props}
    {...movingPointerOnly(props)}
  >
    {children}
    <ChevronRight className="ml-auto text-muted-foreground" aria-hidden="true" />
  </DropdownMenuPrimitive.SubTrigger>
))
DropdownMenuSubTrigger.displayName =
  DropdownMenuPrimitive.SubTrigger.displayName

// A menu and a side menu: at most the room left, scrolling past it (the board's
// Display menu ran off a 640px phone).
const MENU = [
  "max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto overscroll-contain",
  "z-[var(--z-dropdown)] min-w-[8rem] overflow-x-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-overlay pointer-events-auto",
  "duration-[180ms] ease-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",
]

// A side menu is portalled: inside its menu it was clipped away (menuPortalGuard.test.ts).
// Its sheet step's head (Back, title) comes lazily.
const SubStepHead = lazyPiece(() => import("./subStepHead"))
const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, collisionPadding = 8, children, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.SubContent ref={useFloatRef(ref)} collisionPadding={collisionPadding} data-overlay="float" data-overlay-menu="" className={cn(MENU, className)} {...props}>
      {useSheetMode() && (
        <React.Suspense fallback={<div className="min-h-12" />}>
          <SubStepHead />
        </React.Suspense>
      )}
      {children}
    </DropdownMenuPrimitive.SubContent>
  </DropdownMenuPrimitive.Portal>
))
DropdownMenuSubContent.displayName =
  DropdownMenuPrimitive.SubContent.displayName

// data-overlay: an action sheet on a phone, its rows 48px (app/overlay.css).
const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, collisionPadding = 8, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={useFloatRef(ref)}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      data-overlay="float"
      data-overlay-menu=""
      className={cn(MENU, className)}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
))
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName

/**
 * A menu row: keyboard, typeahead and focus return are Radix's, states the
 * layer's. variant="destructive" is a menu's one red row (Delete, Remove).
 */
const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean
    variant?: "default" | "destructive"
  }
>(({ className, inset, variant = "default", ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      // The gap spaces an icon from its words; an icon's own margin (shadcn's
      // old mr-2, on 35 items) is dropped, or rows' words didn't line up.
      "relative flex select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:mr-0",
      variant === "destructive" && "text-danger-ink [&>svg]:text-danger-ink",
      inset && "pl-8",
      className
    )}
    {...ix("item", { tone: variant === "destructive" ? "danger" : undefined })}
    {...props}
    {...movingPointerOnly(props)}
  />
))
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      "relative flex select-none items-center rounded-md py-1.5 pl-8 pr-2 text-sm",
      className
    )}
    checked={checked}
    {...ix("item")}
    {...props}
    {...movingPointerOnly(props)}
  >
    <MenuCheck checked={checked ?? false} className="absolute left-2" />
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
))
DropdownMenuCheckboxItem.displayName =
  DropdownMenuPrimitive.CheckboxItem.displayName

const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      "relative flex select-none items-center rounded-md py-1.5 pl-8 pr-2 text-sm",
      className
    )}
    {...ix("item")}
    {...props}
    {...movingPointerOnly(props)}
  >
    <DropdownMenuPrimitive.ItemIndicator className="absolute left-2">
      <MenuCheck checked />
    </DropdownMenuPrimitive.ItemIndicator>
    {children}
  </DropdownMenuPrimitive.RadioItem>
))
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn(
      // A quiet group label, sentence case, like the sidebar's: it names
      // the group, it is not a row.
      "px-2 py-1.5 text-xs font-medium text-muted-foreground",
      inset && "pl-8",
      className
    )}
    {...props}
  />
))
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-border", className)}
    {...props}
  />
))
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName

const DropdownMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn("ml-auto pl-4 text-xs tabular-nums text-muted-foreground", className)}
      {...props}
    />
  )
}
DropdownMenuShortcut.displayName = "DropdownMenuShortcut"

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
}
