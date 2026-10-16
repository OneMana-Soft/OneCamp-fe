"use client"

import * as React from "react"
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group"
import { cn } from "@/lib/utils/helpers/cn"
import { MenuCheck } from "@/components/ui/menuCheck"

export interface Choice<T extends string> {
  value: T
  label: string
  description: string
  icon?: React.ElementType
  disabled?: boolean
  /** Why it can't be chosen, under its description. */
  note?: string
}

/**
 * Choices as cards (the lock, a move's access): radio semantics, so arrow
 * keys move the choice and a screen reader says "1 of 2"; the chosen card
 * wears the brand ring and a check (a check, not a radio's circle: a pill
 * or a circle is for people and dots, radiusScale.test.ts).
 */
export function ChoiceCards<T extends string>({ value, onChange, choices, label }: { value: T; onChange: (v: T) => void; choices: Choice<T>[]; label: string }) {
  return (
    <RadioGroupPrimitive.Root value={value} onValueChange={(v) => onChange(v as T)} aria-label={label} className="flex flex-col gap-2">
      {choices.map((c) => {
        const Icon = c.icon
        return (
          <RadioGroupPrimitive.Item
            key={c.value}
            value={c.value}
            disabled={c.disabled}
            data-choice={c.value}
            className={cn(
              "group flex w-full items-start gap-3 rounded-xl bg-sunken p-3 text-left outline-none ring-1 ring-inset ring-transparent transition-[box-shadow,background-color] duration-[140ms]",
              "hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand data-[state=checked]:bg-raised data-[state=checked]:shadow-e1 data-[state=checked]:ring-brand/60",
              "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-sunken",
            )}
          >
            {Icon ? (
              <span aria-hidden="true" className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-press text-ink-2 [&>svg]:size-4">
                <Icon />
              </span>
            ) : null}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-ui font-medium text-ink">{c.label}</span>
              <span className="text-ui-sm text-ink-2">{c.description}</span>
              {c.note ? <span className="text-meta text-ink-3">{c.note}</span> : null}
            </span>
            <MenuCheck checked={c.value === value} className="mt-1 text-brand" />
          </RadioGroupPrimitive.Item>
        )
      })}
    </RadioGroupPrimitive.Root>
  )
}

/** A short line that says what went wrong, under a form, read out as it appears. */
export function InlineError({ children }: { children?: React.ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="rounded-lg bg-[color-mix(in_oklab,var(--destructive)_8%,transparent)] px-3 py-2 text-ui-sm text-danger-ink">
      {children}
    </p>
  )
}
