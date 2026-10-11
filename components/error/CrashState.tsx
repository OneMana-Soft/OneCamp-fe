"use client"

import { useState } from "react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { SpotCrash } from "@/components/error/shellSpots"
import { RefreshCw } from "@/lib/icons"

/** A short form of an error's digest, for a person to read out: "7f3a·e1c". */
export function shortRef(digest: string | undefined): string | null {
  const d = (digest ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase()
  if (!d) return null
  return d.length > 4 ? `${d.slice(0, 4)}·${d.slice(4, 7)}` : d
}

/**
 * What a crash says (design v3, shell §L3, mock M6 "Crash"): the crash spot
 * (the logo ring, broken), a plain title, that the rest is fine with a
 * reference when there is one, and two ways out: try again, and copy the
 * details for whoever helps. Nothing loops; the spot fades in once.
 */
export function CrashState({
  title,
  line = "The rest of OneCamp is fine.",
  digest,
  onRetry,
  retryLabel = "Try again",
  details,
  children,
}: {
  title: string
  line?: string
  digest?: string
  onRetry: () => void
  retryLabel?: string
  /** What Copy details puts on the clipboard; omit to drop the button. */
  details?: () => string
  children?: ReactNode
}) {
  const ref = shortRef(digest)
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (!details) return
    try {
      await navigator.clipboard.writeText(details())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* the clipboard refused: nothing to say that would help */
    }
  }
  return (
    <div data-crash-state="" className="flex flex-col items-center text-center">
      <SpotCrash />
      <h1 className="mt-3 text-title-3 font-semibold text-foreground">{title}</h1>
      <p className="mt-1 max-w-[46ch] text-sm text-ink-2">
        {line}
        {ref && (
          <>
            {" "}Ref <span className="font-mono text-2xs tracking-normal">{ref}</span>
          </>
        )}
      </p>
      <div className="mt-3.5 flex items-center gap-2">
        <Button size="sm" onClick={onRetry} className="gap-1.5">
          <RefreshCw className="size-3.5" aria-hidden="true" />
          {retryLabel}
        </Button>
        {details && (
          <Button size="sm" variant="ghost" onClick={() => void copy()}>
            {copied ? "Copied" : "Copy details"}
          </Button>
        )}
      </div>
      {children}
    </div>
  )
}

/** The details a person can paste to whoever helps: the reference, where and when. */
export function crashDetails(error: Error & { digest?: string }): string {
  const where = typeof window === "undefined" ? "" : window.location.pathname
  return [`Ref: ${error.digest ?? "none"}`, `Page: ${where}`, `Time: ${new Date().toISOString()}`, `Error: ${error.name}`].join("\n")
}
