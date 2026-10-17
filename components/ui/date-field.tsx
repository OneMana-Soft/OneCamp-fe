"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { format, isValid, parse } from "date-fns"

import { CalendarIcon, Clock } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { clockTime } from "@/lib/utils/date/clock"
import { usePhone } from "@/hooks/usePhone"
import { inputSizing } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer"

// The pickers load when a field first opens (date-field-panels).
const DatePanel = dynamic(() => import("@/components/ui/date-field-panels").then((m) => m.DatePanel), { ssr: false, loading: () => <div className="size-[280px]" /> })
const TimePanel = dynamic(() => import("@/components/ui/date-field-panels").then((m) => m.TimePanel), { ssr: false, loading: () => <div className="h-[212px]" /> })

/**
 * ONE DATE FIELD AND ONE TIME FIELD (INTERACTION_SPEC D14, PG2-06), in place
 * of the browser's own boxes, which were mm/dd/yyyy in one browser and a
 * 12-hour box with its own clock icon in another, and like nothing else in a
 * form. Every date the app asks for opens the one date picker (DatePicker:
 * a typed date, the quick days, the month and Clear), by its trigger on a
 * computer and in a sheet on a phone. A form's field (DateField) is one
 * trigger for it; a task's or a goal's date (components/task/taskDateField's
 * DateProperty) is another.
 */

/**
 * Where the date picker opens: a popover by its trigger, or a sheet on a
 * phone, holding the same panel. `trigger` is the control that opens it; a
 * day picked, typed or quick, or Clear, closes it.
 */
export function DatePicker({
  trigger,
  label,
  open,
  onOpenChange,
  value,
  from,
  to,
  clearable,
  onPick,
}: {
  trigger: React.ReactElement
  /** What it picks ("Due date"): the sheet's name. */
  label: string
  open: boolean
  onOpenChange: (open: boolean) => void
  value?: Date
  from?: Date
  to?: Date
  /** Whether the date may be empty: Clear shows while it has one. */
  clearable: boolean
  /** The day picked, or undefined for Clear. */
  onPick: (day: Date | undefined) => void
}) {
  const phone = usePhone()
  const panel = open ? (
    <DatePanel
      day={value}
      from={from}
      to={to}
      clearable={clearable}
      onPick={(d) => {
        onPick(d)
        onOpenChange(false)
      }}
      onClear={() => {
        onPick(undefined)
        onOpenChange(false)
      }}
    />
  ) : null
  if (phone) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} detent="medium">
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent aria-describedby={undefined}>
          <DrawerTitle className="sr-only">{label}</DrawerTitle>
          <div className="flex justify-center pb-3">{panel}</div>
        </DrawerContent>
      </Drawer>
    )
  }
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="content-float w-auto rounded-xl bg-pop p-0 shadow-e3" align="start">
        {panel}
      </PopoverContent>
    </Popover>
  )
}

interface FieldProps {
  /** "yyyy-MM-dd" for a date, "HH:mm" (24 hour) for a time; "" for none. */
  value: string
  onChange: (value: string) => void
  id?: string
  name?: string
  required?: boolean
  disabled?: boolean
  placeholder?: string
  className?: string
  /** As Input's: the caller's height everywhere, no 44px floor on a phone. */
  dense?: boolean
  "aria-label"?: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean
}

const DAY = "yyyy-MM-dd"

function dayOf(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const d = parse(value, DAY, new Date())
  return isValid(d) ? d : undefined
}

/** "09:30" as minutes from midnight; null when it isn't a time. */
function minutesOf(value: string | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value ?? "")
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`

const TRIGGER = "field-surface flex w-full min-w-0 items-center gap-2 rounded-md px-2.5 text-left text-sm tabular-nums text-ink disabled:cursor-not-allowed"

/**
 * Whether a field's box is the first of its form's that fails: the browser
 * fires `invalid` at each of them on a submit, and puts its bubble on the
 * first only. With two empty required dates, each opened itself over the
 * other, none stayed open and focus fell to the page (REVIEW-FE-SHELL db2 F1).
 */
function firstInvalid(box: HTMLInputElement): boolean {
  const form = box.form
  if (!form) return true
  for (const el of Array.from(form.elements)) {
    const control = el as HTMLInputElement
    if (control.willValidate && !control.validity.valid) return control === box
  }
  return true
}

/**
 * The id of the <label for> that names a field, given one, so the field's
 * name can carry its value after the label's words. Read once mounted: a
 * label elsewhere in the form can't be known while rendering.
 */
function useLabelFor(id: string | undefined, skip: boolean): string | undefined {
  const [labelId, setLabelId] = React.useState<string>()
  React.useEffect(() => {
    if (skip || !id) return
    const label = Array.from(document.getElementsByTagName("label")).find((l) => l.htmlFor === id)
    if (!label) return
    if (!label.id) label.id = `${id}-label`
    setLabelId(label.id)
  }, [id, skip])
  return labelId
}

/**
 * One field's frame: the trigger, its picker (`picker` wraps the trigger in
 * it), and what a form validates (a box no one sees that carries the value
 * and the required flag; empty and required, it stops the submit and opens
 * the field instead of the browser's bubble over nothing, the first such
 * field of the form only).
 *
 * Its name says its value too, as a date box's did ("Starts on, Thu 15 Oct
 * 2026"): named by its label alone, a screen reader never heard the date it
 * showed (REVIEW-FE-SHELL db2 F3).
 */
function Field({
  icon: Icon,
  shown,
  empty,
  picker,
  props,
}: {
  icon: typeof Clock
  shown: string
  empty: boolean
  picker: (trigger: React.ReactElement, open: boolean, setOpen: (open: boolean) => void) => React.ReactNode
  props: FieldProps
}) {
  const { value, placeholder, className, dense, id, name, required, disabled } = props
  const label = props["aria-label"]
  const [open, setOpen] = React.useState(false)
  const trigger = React.useRef<HTMLButtonElement>(null)
  const valueId = React.useId()
  const labelId = useLabelFor(id, !!label)
  const named = label ? { "aria-label": empty ? label : `${label}, ${shown}` } : labelId && !empty ? { "aria-labelledby": `${labelId} ${valueId}` } : {}
  const button = (
    <button
      ref={trigger}
      type="button"
      id={id}
      disabled={disabled}
      {...named}
      // A form's error state drives the field's red edge (field-surface).
      {...{ "aria-describedby": props["aria-describedby"], "aria-invalid": props["aria-invalid"] }}
      className={cn(TRIGGER, inputSizing(className, dense), className)}
    >
      <Icon className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
      <span id={valueId} className={cn("truncate", empty && "text-ink-3")}>
        {empty ? placeholder : shown}
      </span>
    </button>
  )
  return (
    <span className="relative block min-w-0">
      {picker(button, open, setOpen)}
      {name || required ? (
        <input
          tabIndex={-1}
          aria-hidden="true"
          name={name}
          value={value}
          required={required}
          onChange={() => {}}
          onInvalid={(e) => {
            e.preventDefault()
            if (!firstInvalid(e.currentTarget)) return
            trigger.current?.focus()
            setOpen(true)
          }}
          className="sr-only"
        />
      ) : null}
    </span>
  )
}

/** A date, picked from the date picker. `min` and `max` ("yyyy-MM-dd") bound what can be picked. */
export function DateField({ min, max, ...props }: FieldProps & { min?: string; max?: string }) {
  const day = dayOf(props.value)
  return (
    <Field
      icon={CalendarIcon}
      shown={day ? format(day, "EEE d MMM yyyy") : ""}
      empty={!day}
      props={{ placeholder: "Pick a date", ...props }}
      picker={(trigger, open, setOpen) => (
        <DatePicker
          trigger={trigger}
          label={props["aria-label"] ?? "Date"}
          open={open}
          onOpenChange={setOpen}
          value={day}
          from={dayOf(min)}
          to={dayOf(max)}
          clearable={!props.required}
          onPick={(d) => props.onChange(d ? format(d, DAY) : "")}
        />
      )}
    />
  )
}

/**
 * A time, typed ("9:30", "4pm") or picked from the quarter hours, written on
 * the reader's own clock (12 or 24 hour) and stored as "HH:mm". `since`
 * ("HH:mm"), for an end time: the list starts after it and says how long.
 */
export function TimeField({ since, ...props }: FieldProps & { since?: string }) {
  const minutes = minutesOf(props.value)
  return (
    <Field
      icon={Clock}
      shown={minutes === null ? "" : clockTime(new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60))}
      empty={minutes === null}
      props={{ placeholder: "Pick a time", ...props }}
      picker={(trigger, open, setOpen) => (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent className="content-float w-[220px] rounded-xl bg-pop p-0 shadow-e3" align="start">
            {open ? (
              <TimePanel
                minutes={minutes}
                since={minutesOf(since) ?? undefined}
                onPick={(m) => {
                  props.onChange(hhmm(m))
                  setOpen(false)
                }}
              />
            ) : null}
          </PopoverContent>
        </Popover>
      )}
    />
  )
}
