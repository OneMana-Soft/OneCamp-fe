"use client"

import React, { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Check, Copy } from "@/lib/icons"

/**
 * A block of text meant to be copied rather than read.
 *
 * Exists because two surfaces need exactly this — the MCP admin card and the token-created dialog —
 * and the copy-to-clipboard dance is longer than it looks: a success state that resets itself, a
 * cleared timer so it cannot fire after unmount, an accessible announcement for a change that is
 * otherwise only visible as an icon swap, and a failure path, because navigator.clipboard rejects
 * outside a secure context and a button that silently does nothing is worse than one that says so.
 *
 * Twelve places in the app already call navigator.clipboard directly, each with its own subset of the
 * above. Those are left alone; this is the shape for new ones.
 */
interface CopyableCodeProps {
  /** The exact text placed on the clipboard. Rendered verbatim, whitespace preserved. */
  value: string
  /** Announced and used for the button's accessible name, e.g. "endpoint URL". */
  label: string
  /** Single-line values read better unwrapped; multi-line blocks keep their formatting. */
  className?: string
}

export function CopyableCode({ value, label, className }: CopyableCodeProps) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleared on unmount so a pending reset cannot set state on a gone component. The dialog this
  // renders in is closed by the same click that copies, often enough for it to matter.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const copy = async () => {
    if (timer.current) clearTimeout(timer.current)
    try {
      await navigator.clipboard.writeText(value)
      setState("copied")
    } catch {
      // Rejected outside a secure context, or the permission was refused. Say so rather than
      // pretending: the text is on screen and can be selected by hand.
      setState("failed")
    }
    timer.current = setTimeout(() => setState("idle"), 2000)
  }

  return (
    <div className={`relative rounded-lg border bg-muted/40 ${className ?? ""}`}>
      <pre className="overflow-x-auto p-3 pr-24 text-2xs leading-relaxed">
        <code className="whitespace-pre">{value}</code>
      </pre>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={copy}
        aria-label={state === "copied" ? `${label} copied` : `Copy ${label}`}
        className="absolute right-2 top-2 h-7 gap-1.5 px-2"
      >
        {state === "copied" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {state === "copied" ? "Copied" : "Copy"}
      </Button>
      {/*
        Announced to a screen reader, which otherwise gets nothing from an icon changing shape.
        role=status is polite, so it does not interrupt.
      */}
      <span role="status" aria-live="polite" className="sr-only">
        {state === "copied" ? `${label} copied to clipboard` : ""}
        {state === "failed" ? `Could not copy the ${label}. Select the text and copy it manually.` : ""}
      </span>
      {state === "failed" && (
        <p className="px-3 pb-2 text-2xs text-destructive">
          Couldn&apos;t reach the clipboard. Select the text above and copy it manually.
        </p>
      )}
    </div>
  )
}
