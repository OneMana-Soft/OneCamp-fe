"use client"

import { CopyGlyph } from "@/components/ui/settingsControls"

/**
 * A secret shown once (an API token, an incoming webhook's address): mono on
 * --sunken inside a 1px sun ring, a 32px copy button that morphs to a moss
 * check, and the warning in sun ink; when the copy failed, how to copy it by
 * hand. Enters at scale .98 and fades in over 220ms. `what` names it on the
 * copy button and to a screen reader.
 */
export function RevealCard({ secret, what, copied, copyFailed, onCopy }: { secret: string; what: string; copied: boolean; copyFailed: boolean; onCopy: () => void }) {
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
          <CopyGlyph copied={copied} className="size-4" />
        </button>
      </div>
      <p className="text-xs font-medium text-warning-ink">Copy it now. It won&apos;t be shown again.</p>
      {copyFailed && (
        <p role="alert" className="text-xs text-danger-ink">
          Couldn&apos;t copy. Select the {what} and copy it yourself.
        </p>
      )}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? said : ""}
      </span>
    </div>
  )
}
