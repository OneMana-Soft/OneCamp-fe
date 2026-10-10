"use client"

import * as React from "react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * Field: a label, one control, optional help, and an error, wired together.
 *
 *   <Field label="Email" help="Receipts go here." error={emailError}>
 *     <Input type="email" autoComplete="email" />
 *   </Field>
 *
 * Most forms in the app put a <Label> over an <Input> by hand, and the help or
 * error under it was a loose <p>: a screen reader heard the field and never the
 * sentence that explained it, and an invalid field looked exactly like a valid
 * one until you read the red line. Field gives the control an id (unless it has
 * one), points aria-describedby at the help and the error, sets aria-invalid
 * while there is an error (which Input, Textarea and SelectTrigger style), and
 * announces the error politely when it appears.
 *
 * Layout follows taste-skill's form rule: label above, help under the control,
 * error under that, gap-2. It is an addition: Label, Input and the rest are
 * unchanged, and nothing has to move to it.
 */
interface FieldProps {
  label: React.ReactNode
  /** One line that says something the label does not. */
  help?: React.ReactNode
  /** What is wrong and how to fix it. Present means invalid. */
  error?: React.ReactNode
  /** Visually marks the label; the control still needs its own `required`. */
  required?: boolean
  className?: string
  /** Exactly one control: Input, Textarea, SelectTrigger, Checkbox… */
  children: React.ReactElement<Record<string, unknown>>
}

export function Field({ label, help, error, required, className, children }: FieldProps) {
  const auto = React.useId()
  const childProps = children.props as { id?: string; "aria-describedby"?: string }
  const id = childProps.id ?? `field-${auto}`
  const helpId = help ? `${id}-help` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [childProps["aria-describedby"], helpId, errorId].filter(Boolean).join(" ") || undefined

  const control = React.cloneElement(children, {
    id,
    "aria-describedby": describedBy,
    ...(error ? { "aria-invalid": true } : {}),
  })

  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-0.5 text-muted-foreground" aria-hidden="true">*</span>}
      </Label>
      {control}
      {help && (
        <p id={helpId} className="text-xs text-muted-foreground text-pretty">
          {help}
        </p>
      )}
      <p id={errorId} aria-live="polite" className={cn("text-xs font-medium text-danger-ink text-pretty", !error && "hidden")}>
        {error}
      </p>
    </div>
  )
}
