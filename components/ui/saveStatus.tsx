"use client"

// Saving a setting the moment it changes (design v3, admin §1.3 "Instant"):
// the row says "Saved" with a moss tick that springs in beside its label,
// stays 1.6s and fades, and a polite live region says it to a screen reader.
// A failure puts the control back, shakes the row twice and leaves the
// server's reason under the label. Never a toast for a routine save, and
// never the celebration.

import * as React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Check } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { apiErrorMessage } from "@/lib/utils/apiError"

export type SaveState = "idle" | "saving" | "saved" | "error"

export interface SaveStatus {
  state: SaveState
  /** The server's reason, when the save failed. */
  error?: string
  /** Bumped on each failure, so the row's shake replays. */
  failures: number
}

const SAVED_MS = 1900

/**
 * Why a save failed, in plain words (lib/utils/apiError): the server's own
 * when they say why, else what its answer means. It read the server's raw
 * text, its error key included, and a setting said "boom" (QA F-25).
 */
export function reasonOf(err: unknown): string {
  if (typeof err === "string") return err
  return apiErrorMessage(err, "Try again in a moment.") || "Try again in a moment."
}

/**
 * A row's save status. `run(save)` marks it saving, then saved (for 1.9s, the
 * tick's 1.6s plus its fade) or failed with the reason. The caller restores
 * its own control on failure: `run` resolves to whether the save held.
 */
export function useSaveStatus() {
  const [status, setStatus] = useState<SaveStatus>({ state: "idle", failures: 0 })
  const timer = useRef<number | undefined>(undefined)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      window.clearTimeout(timer.current)
    }
  }, [])

  const run = useCallback(async (save: () => Promise<unknown>): Promise<boolean> => {
    window.clearTimeout(timer.current)
    setStatus((s) => ({ ...s, state: "saving", error: undefined }))
    try {
      await save()
      if (!mounted.current) return true
      setStatus((s) => ({ ...s, state: "saved", error: undefined }))
      timer.current = window.setTimeout(() => {
        if (mounted.current) setStatus((s) => ({ ...s, state: "idle" }))
      }, SAVED_MS)
      return true
    } catch (err) {
      if (mounted.current) setStatus((s) => ({ state: "error", error: reasonOf(err), failures: s.failures + 1 }))
      return false
    }
  }, [])

  const clear = useCallback(() => {
    window.clearTimeout(timer.current)
    setStatus((s) => ({ ...s, state: "idle", error: undefined }))
  }, [])

  return { status, run, clear }
}

/**
 * The tick beside a row's label: "Saved" with a moss check while it shows,
 * and the live region that announces it. Renders nothing at rest, so a row's
 * label never moves for it (it sits after the label, inline).
 */
export function SavedTick({ status, className }: { status?: SaveStatus; className?: string }) {
  const state = status?.state ?? "idle"
  return (
    <>
      {state === "saved" && (
        <span data-saved-tick="" aria-hidden="true" className={cn("saved-tick text-2xs font-medium", className)}>
          <Check className="size-3.5" />
          Saved
        </span>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {state === "saved" ? "Saved" : state === "error" ? `Not saved. ${status?.error ?? ""}` : ""}
      </span>
    </>
  )
}
