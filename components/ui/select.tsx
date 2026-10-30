"use client"

import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { ChevronDown, ChevronUp } from "@/lib/icons";

import { cn } from "@/lib/utils/helpers/cn"
import { inputSizing } from "@/components/ui/input"
import { ix } from "@/lib/ui/interactive"
import { MenuCheck } from "@/components/ui/menuCheck"
import { useSheetMode } from "@/components/ui/overlayMode"
import { lazyView } from "@/lib/lazy/lazyView"
import { useFloatRef } from "@/components/ui/floatMark"

const sheetChunk = lazyView(() => import("@/components/ui/selectSheet"))

/** On a phone the list is the combobox's sheet (components/ui/selectSheet), with Radix kept closed. */
export type SelectSheetState = {
  open: boolean
  setOpen: (open: boolean) => void
  value: string
  pick: (value: string) => void
  trigger: React.RefObject<HTMLButtonElement | null>
}
export const SelectSheetContext = React.createContext<SelectSheetState | null>(null)

/** The sheet's row, which its chunk gives each SelectItem in it. */
export type SelectSheetRowProps = { value: string; disabled?: boolean; className?: string; children: React.ReactNode }
export const SelectSheetRow = React.createContext<React.ComponentType<SelectSheetRowProps> | null>(null)

/** What a Field gives its control (components/ui/field): the root draws no element, so the trigger takes it. */
type FieldGiven = Pick<React.ComponentProps<"button">, "id" | "aria-describedby" | "aria-invalid">
const SelectField = React.createContext<FieldGiven>({})

// The value and the open state live here, for the sheet to pick and close as Radix does.
function Select({ value, defaultValue, onValueChange, open, defaultOpen, onOpenChange, id, "aria-describedby": describedBy, "aria-invalid": invalid, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Root> & FieldGiven) {
  const sheet = useSheetMode()
  const [ownValue, setOwnValue] = React.useState(defaultValue ?? "")
  const [ownOpen, setOwnOpen] = React.useState(defaultOpen ?? false)
  const trigger = React.useRef<HTMLButtonElement>(null)
  const current = value ?? ownValue
  const shown = open ?? ownOpen
  const pick = React.useCallback(
    (next: string) => {
      if (next === current) return
      if (value === undefined) setOwnValue(next)
      onValueChange?.(next)
    },
    [current, value, onValueChange],
  )
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (open === undefined) setOwnOpen(next)
      onOpenChange?.(next)
    },
    [open, onOpenChange],
  )
  const state = React.useMemo(() => (sheet ? { open: shown, setOpen, value: current, pick, trigger } : null), [sheet, shown, setOpen, current, pick])
  const openSheet = React.useCallback((next: boolean) => {
    if (next) setOpen(true)
  }, [setOpen])
  const field = React.useMemo(() => ({ id, "aria-describedby": describedBy, "aria-invalid": invalid }), [id, describedBy, invalid])
  return (
    <SelectSheetContext.Provider value={state}>
      <SelectField.Provider value={field}>
        <SelectPrimitive.Root {...props} value={current} onValueChange={pick} open={!sheet && shown} onOpenChange={sheet ? openSheet : setOpen}>
          {children}
        </SelectPrimitive.Root>
      </SelectField.Provider>
    </SelectSheetContext.Provider>
  )
}

const SelectGroup = SelectPrimitive.Group

const SelectValue = SelectPrimitive.Value

export interface SelectTriggerProps extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> {
  /** In a table cell, a toolbar or beside a dense field: the caller's height (else 32px), with no 44px floor. */
  dense?: boolean
}

/**
 * A text field's height and text size (inputSizing in components/ui/input), so
 * a select beside a field can't drift from it: 44px on a phone and 32px from md
 * up, a caller's height from md up, and with `dense` the caller's everywhere.
 */
const SelectTrigger = React.forwardRef<React.ElementRef<typeof SelectPrimitive.Trigger>, SelectTriggerProps>(
  ({ className, children, dense, ...props }, ref) => {
  const sheet = React.useContext(SelectSheetContext)
  const field = React.useContext(SelectField)
  const own = sheet?.trigger
  const setRef = React.useCallback(
    (node: HTMLButtonElement | null) => {
      if (own) own.current = node
      if (typeof ref === "function") ref(node)
      else if (ref) ref.current = node
    },
    [own, ref],
  )
  // It opens a sheet there, which Radix, kept closed, can't say.
  const opener = sheet && { "aria-haspopup": "dialog" as const, "aria-expanded": sheet.open, "data-state": sheet.open ? "open" : "closed" }
  return (
  <SelectPrimitive.Trigger
    ref={setRef}
    className={cn(
      // A long value ends in an ellipsis: line-clamp cut it mid-letter on one nowrap line.
      "field-surface flex w-full items-center justify-between gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-base md:text-sm data-[placeholder]:text-faint-foreground [&>span]:min-w-0 [&>span]:truncate",
      inputSizing(className, dense),
      className
    )}
    {...field}
    {...props}
    {...opener}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 shrink-0 text-faint-foreground" aria-hidden="true" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
  )
})
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      className
    )}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
))
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-1",
      className
    )}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
))
SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => {
  const sheet = React.useContext(SelectSheetContext)
  // Kept from its first opening, so the sheet slides away as it closes.
  const [drawn, setDrawn] = React.useState(false)
  if (sheet?.open && !drawn) setDrawn(true)
  // Closed on a phone, Radix still keeps the rows out of sight for the trigger's value.
  const list = (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={useFloatRef(ref)}
        data-overlay="float"
        data-overlay-menu=""
        className={cn(
          "relative z-[var(--z-dropdown)] max-h-96 min-w-[8rem] overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-overlay pointer-events-auto duration-[180ms] ease-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className
        )}
        position={position}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            "p-1",
            position === "popper" &&
              "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
  if (!sheet) return list
  return (
    <>
      {list}
      {drawn ? <sheetChunk.View fallback={null} render={(m) => <m.SelectSheet state={sheet}>{children}</m.SelectSheet>} /> : null}
    </>
  )
})
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn("px-2 py-1.5 text-xs font-medium text-muted-foreground", className)}
    {...props}
  />
))
SelectLabel.displayName = SelectPrimitive.Label.displayName

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => {
  const Row = React.useContext(SelectSheetRow)
  if (Row) return <Row value={props.value} disabled={props.disabled} className={className}>{children}</Row>
  return (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full select-none items-center rounded-md py-1.5 pl-2 pr-8 text-sm",
      className
    )}
    {...ix("item")}
    {...props}
  >
    <SelectPrimitive.ItemIndicator className="absolute right-2 flex">
      <MenuCheck checked />
    </SelectPrimitive.ItemIndicator>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
  )
})
SelectItem.displayName = SelectPrimitive.Item.displayName

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-border", className)}
    {...props}
  />
))
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
}
