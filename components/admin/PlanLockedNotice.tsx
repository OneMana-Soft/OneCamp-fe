"use client"

import { Lock } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { UPGRADE_STEPS } from "@/lib/plan/upgradeSteps"

/**
 * Where a company control would be, on the free plan: what it is, why it is not
 * here, and where to get it. One component so every locked control reads the
 * same and links to the same place.
 */
export function PlanLockedNotice({
  what,
  upgradeUrl,
  className,
}: {
  /** The control, as a sentence subject: "SCIM provisioning", "Exporting the audit log". */
  what: string
  /** Where to get a licence, as the server reports it; no link when unknown. */
  upgradeUrl?: string
  className?: string
}) {
  return (
    <div
      role="note"
      className={cn("flex items-start gap-2.5 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-sm", className)}
    >
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">{what} needs a OneCamp licence.</span> The free plan includes
        everything a team uses, but not company controls: single sign-on, LDAP, SCIM and audit export.
        {upgradeUrl && (
          <>
            {" "}
            <a href={upgradeUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-2 hover:underline">
              See the licence
            </a>
          </>
        )}
        <span className="mt-1 block text-xs">{UPGRADE_STEPS}</span>
      </p>
    </div>
  )
}
