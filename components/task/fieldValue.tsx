"use client"

// A custom field's value, to read: options as pills in their colours, a tick
// for a checkbox, a link for a URL, text for the rest. The list, the board's
// cards (cardFields.tsx) and the panel (for people who can't change it) show
// values this way.

import { Check } from "@/lib/icons"
import { formatFieldValue, optionOf, type FieldValue, type TaskField } from "@/lib/tasks/fields"
import { cn } from "@/lib/utils/helpers/cn"
import { Chip } from "@/components/ui/chip"
import { campHueOf } from "@/lib/campHue"

// An option reads as a neutral chip with a 6px dot in its colour (design v3,
// work.md W35): the colour names the option without the tinted pill that
// made a row a third coloured shape after status and priority.
export function OptionPill({ label, color, className }: { label: string; color?: string; className?: string }) {
  const hue = campHueOf(color)
  return (
    <Chip dot={hue ?? undefined} className={cn("max-w-[10rem]", className)} title={label}>
      {label}
    </Chip>
  )
}

export function FieldValueView({
  field,
  value,
  nameOf,
  className,
}: {
  field: TaskField
  value: FieldValue | undefined
  nameOf?: (id: string) => string | undefined
  className?: string
}) {
  if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) return null
  switch (field.type) {
    case "select": {
      const o = optionOf(field, String(value))
      return o ? <OptionPill label={o.label} color={o.color} className={className} /> : null
    }
    case "multi_select":
      return (
        // Plain names read as one list, so they are joined with commas.
        <span className={cn("truncate text-xs text-foreground", className)}>
          {(Array.isArray(value) ? value : [])
            .map((id) => optionOf(field, id)?.label)
            .filter(Boolean)
            .join(", ")}
        </span>
      )
    case "checkbox":
      return value === true ? (
        <span className={cn("inline-flex items-center text-foreground", className)}>
          <Check className="h-4 w-4" aria-hidden />
          <span className="sr-only">Yes</span>
        </span>
      ) : null
    case "url":
      return (
        <a
          href={String(value)}
          target="_blank"
          rel="noopener noreferrer"
          // A card or row opens the task on click; the link opens the link.
          onClick={(e) => e.stopPropagation()}
          className={cn("truncate text-primary underline-offset-2 hover:underline", className)}
        >
          {formatFieldValue(field, value)}
        </a>
      )
    default: {
      const text = formatFieldValue(field, value, nameOf)
      return text ? <span className={cn("truncate tabular-nums", className)}>{text}</span> : null
    }
  }
}
