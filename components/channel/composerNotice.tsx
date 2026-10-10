"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * What stands where the message box would be when nobody can write here: an
 * archived channel, or an announcement channel for someone who isn't a
 * moderator. One anatomy for both, desktop and phone: the icon beside its
 * words, the two kept together when the words wrap. The desktop's archived
 * line was bare text where the read-only one had an icon, and on a phone the
 * archive icon sat at the screen's left edge while its two lines of text
 * were centred away from it.
 */
export function ComposerNotice({ icon, children, className }: { icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div data-composer-notice="" className={cn("flex w-full justify-center py-4", className)}>
      <p className="inline-flex max-w-prose items-start gap-2 text-left text-sm text-muted-foreground">
        <span className="mt-0.5 shrink-0 [&_svg]:size-4" aria-hidden="true">
          {icon}
        </span>
        <span>{children}</span>
      </p>
    </div>
  )
}
