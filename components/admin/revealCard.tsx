"use client"

import { Check, Copy } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * A secret shown once (an API token, an incoming webhook's address): mono on
 * --sunken inside a 1px sun ring, a 32px copy button that morphs to a moss
 * check, and the warning in sun ink. Enters at scale .98 and fades in over
 * 220ms. `what` names it on the copy button and to a screen reader.
 */
export function RevealCard({ secret, what, copied, onCopy }: { secret: string; what: string; copied: boolean; onCopy: () => void }) {
  const said = `${what[0].toUpperCase()}${what.slice(1)} copied`
  return (
    <div data-token-reveal="" className="you-reveal-card space-y-2">
      <div className="you-reveal-token">
        <code className="min-w-0 flex-1 break-all font-mono text-xs text-foreground" translate="no">
          {secret}
        </code>
        <button
          type="button"
          onClick={onCopy}
          data-copy-state={copied ? "copied" : "idle"}
          aria-label={copied ? said : `Copy ${what}`}
          className="you-reveal-copy"
        >
          <Copy className={cn("col-start-1 row-start-1 size-4 transition-opacity duration-150", copied ? "opacity-0" : "opacity-100")} aria-hidden="true" />
          <Check
            className={cn(
              "col-start-1 row-start-1 size-4 text-success-ink transition-[opacity,transform] duration-[220ms] ease-[var(--ease-spring)]",
              copied ? "scale-100 opacity-100" : "scale-50 opacity-0",
            )}
            aria-hidden="true"
          />
        </button>
      </div>
      <p className="text-xs font-medium text-warning-ink">Copy it now. It won&apos;t be shown again.</p>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? said : ""}
      </span>
    </div>
  )
}
