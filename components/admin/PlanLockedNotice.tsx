"use client"

import { ArrowRight, Lock } from "@/lib/icons"
import { Tile } from "@/components/ui/graphics/Tile"
import { cn } from "@/lib/utils/helpers/cn"
import { UPGRADE_STEPS } from "@/lib/plan/upgradeSteps"

/**
 * Where a company control would be, on the free plan (design v3, admin
 * §1.7): a note, not a control, so it sits on --sunken with an inset ring and
 * no elevation. A 32px sun tile with the lock, what needs the licence in one
 * line, why in one sentence, and "See the licence →". The steps to get one
 * wait behind "How", instead of a second line of fine print.
 *
 * It replaces the controls it stands for, inside their card; it never sits
 * above them as a banner.
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
    <div role="note" data-plan-locked="" className={cn("flex items-start gap-3 rounded-lg bg-sunken p-4 shadow-[inset_0_0_0_1px_var(--line)]", className)}>
      <Tile hue="sun" size="md" className="rounded-[9px]">
        <Lock />
      </Tile>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{what} needs a OneCamp licence.</p>
        <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
          The free plan has everything a team uses, but not company controls: single sign-on, LDAP, SCIM and audit export.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {upgradeUrl && (
            <a
              href={upgradeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-brand-text underline-offset-[3px] hover:underline"
            >
              See the licence
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </a>
          )}
          <details className="group text-muted-foreground">
            <summary className="cursor-pointer list-none font-medium hover:text-foreground [&::-webkit-details-marker]:hidden">How</summary>
            <p className="mt-1 max-w-[60ch] text-pretty">{UPGRADE_STEPS}</p>
          </details>
        </div>
      </div>
    </div>
  )
}
