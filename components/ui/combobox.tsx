"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import type * as Menu from "@/components/ui/comboboxMenu"

import { ChevronDown } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { inputSizing } from "@/components/ui/inputSizing"
import { useSheetMode } from "@/components/ui/overlayMode"
import { Popover, PopoverTrigger } from "@/components/ui/popover"
import { inlineAffordance, inlineValue } from "@/lib/ui/inlineValue"
import { cn } from "@/lib/utils/helpers/cn"
import { once } from "@/lib/lazy/once"

/*
 * THE COMBOBOX: something to pick from a list with a filter, one thing or
 * many, opened from a field, a panel's value or a chip. shadcn's part names,
 * on our Popover and cmdk (shadcn's own is on Base UI); the menu's look is
 * in comboboxMenu, with an example.
 *
 * The open menu is a chunk of its own (comboboxMenu), fetched as the pointer
 * or the focus reaches the field. app/comboboxGuard.test.ts holds the app to
 * it: cmdk is drawn here (and in the command palette), and a list still drawn
 * by hand only leaves.
 *
 * On a phone (components/ui/overlayMode) the menu is a sheet, never a popover
 * over the page (design/drawers-v3): a panel of the sheet it is in, with Back,
 * else a sheet of its own titled with the menu's label. The trigger opens it
 * by its press, so no popover is drawn round it there.
 */

type ComboboxState = {
  open: boolean
  setOpen: (open: boolean) => void
  multiple: boolean
  field: boolean
  setField: (field: boolean) => void
  /** The menu opens as a sheet (a phone). */
  sheet: boolean
}
export const ComboboxContext = React.createContext<ComboboxState | null>(null)
/** cmdk names its filter by the menu's label element: the filter tells the menu its name. */
export const FilterName = React.createContext<((name: string | undefined) => void) | null>(null)

interface ComboboxProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  /** Many can be chosen: a row is ticked and the menu stays open. */
  multiple?: boolean
  modal?: boolean
  children?: React.ReactNode
}

function Combobox({ open, defaultOpen = false, onOpenChange, multiple = false, modal, children }: ComboboxProps) {
  const sheet = useSheetMode()
  const [own, setOwn] = React.useState(defaultOpen)
  const [field, setField] = React.useState(false)
  const shown = open ?? own
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (open === undefined) setOwn(next)
      onOpenChange?.(next)
    },
    [open, onOpenChange],
  )
  const state = React.useMemo(() => ({ open: shown, setOpen, multiple, field, setField, sheet }), [shown, setOpen, multiple, field, sheet])
  return (
    <ComboboxContext.Provider value={state}>
      {sheet ? (
        children
      ) : (
        <Popover open={shown} onOpenChange={setOpen} modal={modal}>
          {children}
        </Popover>
      )}
    </ComboboxContext.Provider>
  )
}

/** On a phone, what PopoverTrigger is elsewhere: a press opens the menu's sheet, and says it opens one. */
const SheetOpener = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof PopoverTrigger>>(
  ({ asChild, onClick, ...props }, ref) => {
    const state = React.useContext(ComboboxContext)
    const Opener = asChild ? Slot : "button"
    return (
      <Opener
        ref={ref}
        type={asChild ? undefined : "button"}
        aria-haspopup="dialog"
        aria-expanded={state?.open ?? false}
        data-state={state?.open ? "open" : "closed"}
        onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
          onClick?.(event)
          if (!event.defaultPrevented) state?.setOpen(!state.open)
        }}
        {...props}
      />
    )
  },
)
SheetOpener.displayName = "SheetOpener"

/** The menu's opener: the popover's trigger, or on a phone its sheet's. */
function useOpener() {
  return React.useContext(ComboboxContext)?.sheet ? SheetOpener : PopoverTrigger
}

/** What opens it when it is not a field (a chip, an avatar): it keeps its own role and name. */
const ComboboxTrigger = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof PopoverTrigger>>((props, ref) => {
  const Opener = useOpener()
  return <Opener ref={ref} {...fetchOnApproach(props)} />
})
ComboboxTrigger.displayName = "ComboboxTrigger"

interface ComboboxFieldProps extends React.ComponentPropsWithoutRef<"button"> {
  /** field: a form's field (design v3's surface); inline: a panel's value, text that tints. */
  variant?: "field" | "inline"
  /** Shown, in the faint ink, while there is no value (no children). */
  placeholder?: React.ReactNode
  /** Before the value: the chosen person's avatar, a glyph. */
  icon?: React.ReactNode
  /** In a dense grid: the caller's height at every width, with no 44px floor on a phone. */
  dense?: boolean
}

/** The field that shows the value and opens the list, named by its label or aria-label: a select's twin, or inline a panel's value. */
const ComboboxField = React.forwardRef<HTMLButtonElement, ComboboxFieldProps>(
  ({ variant = "field", placeholder, icon, dense, className, children, ...rest }, ref) => {
    const props = fetchOnApproach(rest)
    const state = React.useContext(ComboboxContext)
    const Opener = useOpener()
    const setField = state?.setField
    // The menu takes a field's width (a chip's or a button's is its own 256px).
    React.useEffect(() => {
      setField?.(true)
      return () => setField?.(false)
    }, [setField])
    const empty = children === undefined || children === null || children === false || children === ""
    const inline = variant === "inline"
    const shown = (
      <>
        {icon}
        <span className={cn("min-w-0 flex-1 truncate text-start", empty && (inline ? "text-muted-foreground" : "text-faint-foreground"))}>{empty ? placeholder : children}</span>
      </>
    )
    if (inline) {
      return (
        <Opener asChild>
          <Button ref={ref} type="button" variant="ghost" role="combobox" aria-expanded={state?.open ?? false} data-placeholder={empty ? "" : undefined} className={cn(inlineValue, className)} {...props}>
            {shown}
            <ChevronDown className={cn(inlineAffordance, "size-3.5")} aria-hidden="true" />
          </Button>
        </Opener>
      )
    }
    return (
      <Opener asChild>
        <button
          ref={ref}
          type="button"
          // aria-controls comes from PopoverTrigger (asChild): the menu's id.
          // eslint-disable-next-line jsx-a11y/role-has-required-aria-props
          role="combobox"
          aria-expanded={state?.open ?? false}
          data-placeholder={empty ? "" : undefined}
          className={cn(
            "field-surface flex w-full items-center justify-between gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-base md:text-sm disabled:cursor-not-allowed",
            inputSizing(className, dense),
            className,
          )}
          {...props}
        >
          {shown}
          <ChevronDown className="size-4 shrink-0 text-faint-foreground" aria-hidden="true" />
        </button>
      </Opener>
    )
  },
)
ComboboxField.displayName = "ComboboxField"


let menu: typeof Menu | undefined

/** Fetches the open menu's chunk, once (again after a failed fetch). */
export const preloadCombobox: () => Promise<typeof Menu> = once(() => import("@/components/ui/comboboxMenu").then((m) => (menu = m)))

/** A trigger's handlers, each fetching the menu first. */
function fetchOnApproach<P extends Pick<React.HTMLAttributes<HTMLElement>, "onPointerEnter" | "onPointerDown" | "onFocus">>(props: P): P {
  const { onPointerEnter, onPointerDown, onFocus } = props
  return {
    ...props,
    onPointerEnter: (e: React.PointerEvent<HTMLElement>) => (void preloadCombobox(), onPointerEnter?.(e)),
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => (void preloadCombobox(), onPointerDown?.(e)),
    onFocus: (e: React.FocusEvent<HTMLElement>) => (void preloadCombobox(), onFocus?.(e)),
  }
}

type Part = "ComboboxContent" | "ComboboxInput" | "ComboboxList" | "ComboboxEmpty" | "ComboboxGroup" | "ComboboxSeparator" | "ComboboxItem"

/** A part of the open menu: drawn once its chunk is here. */
function part<K extends Part>(name: K) {
  function Loaded(props: React.ComponentProps<(typeof Menu)[K]>) {
    const Drawn = (menu ?? React.use(preloadCombobox()))[name] as React.ElementType
    return <Drawn {...props} />
  }
  function Lazy(props: React.ComponentProps<(typeof Menu)[K]>) {
    return menu ? <Loaded {...props} /> : <React.Suspense fallback={null}><Loaded {...props} /></React.Suspense>
  }
  Lazy.displayName = name
  return Lazy
}

const OpenMenu = part("ComboboxContent")

/** The menu: nothing until it first opens. */
function ComboboxContent(props: React.ComponentProps<typeof Menu.ComboboxContent>) {
  const open = React.useContext(ComboboxContext)?.open
  if (!open && !menu) return null
  return <OpenMenu {...props} />
}
const ComboboxInput = part("ComboboxInput")
const ComboboxList = part("ComboboxList")
const ComboboxEmpty = part("ComboboxEmpty")
const ComboboxGroup = part("ComboboxGroup")
const ComboboxSeparator = part("ComboboxSeparator")
const ComboboxItem = part("ComboboxItem")

export {
  Combobox,
  ComboboxTrigger,
  ComboboxField,
  ComboboxContent,
  ComboboxInput,
  ComboboxList,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxSeparator,
  ComboboxItem,
}
