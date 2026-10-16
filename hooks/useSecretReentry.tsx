"use client"

import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { type SecretDestination, secretMoves, secretReentryHint } from "@/lib/utils/secretDestination"

/**
 * A stored secret is bound to the address it was given for (lib/utils/secretDestination.ts).
 * Every settings form that keeps a secret beside an address asks for it again the same way:
 * the field turns required, with "Enter the … again for the new address." under it, and a
 * save stops there with the cursor in it, before the server would refuse. One hook, so seven
 * forms can't drift apart.
 *
 *   const key = useSecretReentry({ stored, entered: apiKey, from, to, noun: "API key" })
 *   if (!key.check()) return            // in save
 *   <Input {...key.inputProps} … />    // the secret field
 *   {key.note}                          // under it
 */
interface SecretReentryOptions {
  /** A secret is stored for `from`. */
  stored: boolean
  /** What the person has typed into the secret field. */
  entered: string
  from: SecretDestination
  to: SecretDestination
  /** The secret as the form names it: "API key", "runner token", "password". */
  noun: string
}

export function useSecretReentry({ stored, entered, from, to, noun }: SecretReentryOptions) {
  const noteId = React.useId()
  const ref = React.useRef<HTMLInputElement>(null)
  const [error, setError] = React.useState("")
  const required = stored && secretMoves(from, to)
  const missing = required && !entered.trim()
  const hint = secretReentryHint(noun)

  // Typing the secret, or moving back to the saved address, settles it.
  React.useEffect(() => {
    if (!missing && error) setError("")
  }, [missing, error])

  return {
    required,
    /** Before saving: false, with the field saying why and the cursor in it, when the secret must be entered again. */
    check: () => {
      if (!missing) return true
      setError(hint)
      ref.current?.focus()
      return false
    },
    inputProps: {
      ref,
      required,
      "aria-invalid": error ? (true as const) : undefined,
      "aria-describedby": required ? noteId : undefined,
    },
    /** The placeholder while it must be entered again, or undefined to keep the form's own. */
    placeholder: required ? "Enter it again for the new address" : undefined,
    note: required ? (
      <p id={noteId} aria-live="polite" className={cn("text-xs text-pretty", error ? "font-medium text-danger-ink" : "text-muted-foreground")}>
        {error || hint}
      </p>
    ) : null,
  }
}
