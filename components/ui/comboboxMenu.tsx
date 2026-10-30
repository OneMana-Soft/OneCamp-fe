"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { Command as CommandPrimitive } from "cmdk"

import { Search } from "@/lib/icons"
import { ComboboxContext, FilterName } from "@/components/ui/combobox"
import { MenuCheck, menuCheckState, type MenuChecked } from "@/components/ui/menuCheck"
import { focusDialogItself } from "@/components/ui/overlayFocus"
import { PickerSheet } from "@/components/ui/pickerSheet"
import { PopoverContent } from "@/components/ui/popover"
import { useSheetPanel } from "@/components/ui/sheetPanels"
import { ix } from "@/lib/ui/interactive"
import { isTouchScreen } from "@/lib/ui/touchScreen"
import { cn } from "@/lib/utils/helpers/cn"

// THE COMBOBOX'S OPEN MENU (components/ui/combobox): a chunk of its own,
// fetched as the pointer or the focus reaches the field, so a page whose
// picker stays shut never loads cmdk or these rows. It is design v3's picker
// (work.md W01): pop, e3, r12, 4px in; a 32px filter; rows of 30px, 44px
// under a finger (app/phone.css F3). The row chosen in a list of one ends
// with its check, as a select's does; a list of many leads each row with it,
// as a checkbox. Esc closes the menu and nothing else, in a dialog too, and
// the field gets the focus back. On a phone it is a sheet (combobox.tsx): the
// filter pinned at the top of the sheet's one scroller, the list under it.
//
//   <Combobox>
//     <ComboboxField aria-label="Owner" placeholder="Choose…">{name}</ComboboxField>
//     <ComboboxContent label="Owner">
//       <ComboboxInput placeholder="Find someone…" />
//       <ComboboxList>
//         <ComboboxEmpty>Nobody by that name.</ComboboxEmpty>
//         <ComboboxItem value={id} keywords={[name]} checked={id === owner} onSelect={setOwner}>…</ComboboxItem>
//       </ComboboxList>
//     </ComboboxContent>
//   </Combobox>

/** No row lit: the highlight cmdk is told while nothing is chosen under a finger, which matches no row. */
const NO_ROW = "\u0000"

/** Under a finger, with no hover to explain a lit row, the menu opens with none lit until something is chosen or typed. */
const quietStart = () => (isTouchScreen() ? NO_ROW : undefined)

/**
 * Where the menu opens: the row it is told (selected), or the first row
 * checked, highlighted and in the middle of the list, as a select does. It
 * runs as the menu's content mounts (in the portal, after the items), before
 * the first paint, so no other row is ever seen lit. What scrolls is the list,
 * or on a phone the sheet's one scroller round it.
 */
function OpenOn({ selected, onFound }: { selected?: string; onFound: (value: string) => void }) {
  const mark = React.useRef<HTMLSpanElement>(null)
  React.useLayoutEffect(() => {
    const list = mark.current?.closest("[data-combobox-content]")?.querySelector<HTMLElement>("[cmdk-list]")
    const at = (value: string) => list?.querySelector<HTMLElement>(`[data-combobox-value="${CSS.escape(value)}"]`)
    const row = (selected !== undefined ? at(selected) : null) ?? list?.querySelector<HTMLElement>('[data-combobox-value][aria-checked="true"]')
    const value = row?.getAttribute("data-combobox-value")
    if (!list || !row || value == null) return
    onFound(value)
    const scroller = list.closest<HTMLElement>("[data-sheet-body]") ?? list
    const frame = requestAnimationFrame(() => {
      const top = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top
      scroller.scrollTop += top - (scroller.clientHeight - row.offsetHeight) / 2
    })
    return () => cancelAnimationFrame(frame)
    // Once per opening: the content mounts afresh each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <span ref={mark} hidden />
}

interface ComboboxContentProps extends Omit<React.ComponentPropsWithoutRef<typeof PopoverContent>, "children"> {
  /** Names the menu for a screen reader ("Assignee"); its filter is named by its placeholder. */
  label?: string
  /** The value to open on, highlighted and in view; by default the first row checked (a list of one's chosen row, a list of many's first ticked). */
  selected?: string
  /** cmdk's own: shouldFilter, filter, loop… */
  command?: Omit<React.ComponentPropsWithoutRef<typeof CommandPrimitive>, "children" | "label">
  children?: React.ReactNode
}

/**
 * The menu: 256px, or a field's width where that is wider (a chip's menu
 * keeps its 256px, at the chip's start), never past the screen, and as tall
 * as the room under or over the field allows (its list scrolls). Under a
 * finger the filter waits to be tapped, so no keyboard rises over a short
 * list: the menu itself takes the focus. Inside a dialog, pass
 * portalled={false}, so the dialog's scroll lock lets the list scroll. On a
 * phone it is a panel of the sheet it is in, else a sheet of its own titled
 * with `label`; the caller's data- and aria- marks go on it, and the popover's
 * placement doesn't apply.
 */
const ComboboxContent = React.forwardRef<React.ElementRef<typeof PopoverContent>, ComboboxContentProps>(
  ({ label, selected, command, className, align = "start", collisionPadding = 8, onOpenAutoFocus, children, ...props }, ref) => {
    const [filterName, setFilterName] = React.useState<string>()
    const state = React.useContext(ComboboxContext)
    const open = state?.open
    // The row cmdk highlights: where the menu opens (OpenOn), then the keys'
    // and the pointer's. Under a finger, which has no hover to explain a
    // highlight, another row lit reads as the one chosen: none is lit there
    // until a row is chosen or the filter finds one.
    const [highlight, setHighlight] = React.useState<string | undefined>(quietStart)
    React.useEffect(() => {
      if (!open) setHighlight(quietStart())
    }, [open])
    const sheet = !!state?.sheet
    const close = React.useCallback(() => state?.setOpen(false), [state])
    const { inSheet, host } = useSheetPanel(sheet && !!open, label ?? filterName ?? "", close)
    const menu = (
      <CommandPrimitive label={filterName} value={highlight} onValueChange={setHighlight} {...command} className={cn("flex min-h-0 flex-1 flex-col bg-transparent text-popover-foreground", command?.className)}>
        <FilterName.Provider value={setFilterName}>{children}</FilterName.Provider>
        <OpenOn selected={selected} onFound={setHighlight} />
      </CommandPrimitive>
    )
    if (sheet) {
      const marks = Object.fromEntries(Object.entries(props).filter(([k]) => k.startsWith("data-") || k.startsWith("aria-") || k === "id"))
      const body = (
        <div ref={ref} data-combobox-content="" aria-label={label} className="flex flex-col px-2 pb-2" {...marks}>
          {menu}
        </div>
      )
      if (inSheet) return host ? createPortal(body, host) : null
      return (
        <PickerSheet
          label={label ?? filterName ?? ""}
          open={!!open}
          onOpenChange={(next: boolean) => state?.setOpen(next)}
          detent="half"
        >
          {body}
        </PickerSheet>
      )
    }
    return (
    <PopoverContent
      ref={ref}
      align={align}
      collisionPadding={collisionPadding}
      aria-label={label}
      data-combobox-content=""
      onOpenAutoFocus={(event) => {
        onOpenAutoFocus?.(event)
        if (!event.defaultPrevented && isTouchScreen()) focusDialogItself(event)
      }}
      className={cn(
        "flex max-h-[min(26rem,var(--radix-popover-content-available-height))] w-64 max-w-[calc(100vw-1rem)] flex-col overflow-hidden p-1",
        state?.field && "min-w-[var(--radix-popover-trigger-width)]",
        className,
      )}
      {...props}
    >
      {menu}
    </PopoverContent>
    )
  },
)
ComboboxContent.displayName = "ComboboxContent"

/**
 * The filter: a glyph, no ring, named by its placeholder without the "…";
 * `hint` on its right (a key: S). 32px at 14px from md up; 44px at 16px on a
 * phone, a finger's height that iOS doesn't zoom into.
 */
const ComboboxInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input> & { hint?: React.ReactNode }
>(({ className, hint, placeholder, "aria-label": ariaLabel, ...props }, ref) => {
  const name = ariaLabel ?? placeholder?.replace(/(…|\.\.\.)$/, "")
  const tell = React.useContext(FilterName)
  React.useEffect(() => tell?.(name), [tell, name])
  const sheet = React.useContext(ComboboxContext)?.sheet
  return (
    <div cmdk-input-wrapper="" className={cn("mb-1 flex h-11 shrink-0 items-center gap-2 border-b border-line px-2 md:h-8", sheet && "sticky top-0 z-10 bg-pop")}>
      <Search className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
      <CommandPrimitive.Input
        ref={ref}
        placeholder={placeholder}
        className={cn("h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink-3 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm", className)}
        {...props}
      />
      {hint}
    </div>
  )
})
ComboboxInput.displayName = "ComboboxInput"

/** The rows: the menu's scroller, or on a phone part of the sheet's one scroller (nothing scrolls beside it). */
const ComboboxList = React.forwardRef<React.ElementRef<typeof CommandPrimitive.List>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>>(
  ({ className, ...props }, ref) => {
    const sheet = React.useContext(ComboboxContext)?.sheet
    return (
      <CommandPrimitive.List
        ref={ref}
        className={cn(sheet ? "overflow-visible" : "min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain scroll-py-1", className)}
        {...props}
      />
    )
  },
)
ComboboxList.displayName = "ComboboxList"

const ComboboxEmpty = React.forwardRef<React.ElementRef<typeof CommandPrimitive.Empty>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>>(
  ({ className, ...props }, ref) => <CommandPrimitive.Empty ref={ref} className={cn("px-2 py-6 text-center text-sm text-ink-3", className)} {...props} />,
)
ComboboxEmpty.displayName = "ComboboxEmpty"

const ComboboxGroup = React.forwardRef<React.ElementRef<typeof CommandPrimitive.Group>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>>(
  ({ className, ...props }, ref) => (
    <CommandPrimitive.Group
      ref={ref}
      className={cn("[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-meta [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-3", className)}
      {...props}
    />
  ),
)
ComboboxGroup.displayName = "ComboboxGroup"

const ComboboxSeparator = React.forwardRef<React.ElementRef<typeof CommandPrimitive.Separator>, React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>>(
  ({ className, ...props }, ref) => <CommandPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-line", className)} {...props} />,
)
ComboboxSeparator.displayName = "ComboboxSeparator"

interface ComboboxItemProps extends Omit<React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>, "value" | "onSelect"> {
  /** What the row stands for (an id): handed back as written, and searched with its keywords. */
  value: string
  /** Chosen (a dash for some): the row says so and draws the one check. */
  checked?: MenuChecked
  onSelect?: (value: string) => void
  /** In a list of one, choosing this row leaves the menu open (Refresh, Show more). */
  keepOpen?: boolean
  /** Where the check sits, when the row's own lead matters more (a person's avatar): by default it leads in a list of many and ends a list of one. */
  checkAt?: "start" | "end"
}

/**
 * A row: what it shows, searched by its value and keywords. In a list of one,
 * choosing it closes the menu; its check, while chosen, ends the row. In a
 * list of many (Combobox multiple) the check leads and the menu stays open.
 * Outside a Combobox (a list still drawn by hand) it draws as one of one and
 * only calls back.
 */
const ComboboxItem = React.forwardRef<React.ElementRef<typeof CommandPrimitive.Item>, ComboboxItemProps>(
  ({ value, checked, onSelect, keepOpen, checkAt, className, children, ...props }, ref) => {
    const state = React.useContext(ComboboxContext)
    const many = !!state?.multiple
    const leads = (checkAt ?? (many ? "start" : "end")) === "start"
    const check = checked === undefined ? null : <MenuCheck checked={checked} className={leads ? undefined : "ml-auto text-ink-2"} />
    return (
      <CommandPrimitive.Item
        ref={ref}
        value={value}
        onSelect={() => {
          onSelect?.(value)
          if (state && !many && !keepOpen) state.setOpen(false)
        }}
        className={cn(
          "relative flex min-h-[30px] cursor-default select-none items-center gap-2 rounded-md px-2 py-1 text-sm font-[450] data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
          className,
        )}
        data-combobox-value={value}
        {...ix("item")}
        {...(checked === undefined ? {} : menuCheckState(checked))}
        {...props}
      >
        {leads ? check : null}
        {children}
        {leads ? null : check}
      </CommandPrimitive.Item>
    )
  },
)
ComboboxItem.displayName = "ComboboxItem"

export { ComboboxContent, ComboboxInput, ComboboxList, ComboboxEmpty, ComboboxGroup, ComboboxSeparator, ComboboxItem }
export type { ComboboxContentProps, ComboboxItemProps }
