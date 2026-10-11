"use client"

import * as React from "react"
import { useEffect, useId, useState } from "react"
import { ChevronDown } from "@/lib/icons"

/**
 * A settings card folded to its title row (design v3, admin §A15 Advanced):
 * the title on the left, what is in force on the right ("On · 3,600 s a day")
 * and a chevron; the whole row opens it. The cards inside lose their own
 * surface (ai.css), so it reads as one card of rows.
 *
 * A link to the card (`#ai-models-sandbox`) opens it, so a jump never lands on
 * a closed lid.
 */
export function CollapsibleCard({
  id,
  title,
  summary,
  children,
  defaultOpen = false,
}: {
  id: string
  title: React.ReactNode
  summary?: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const bodyId = useId()
  const [open, setOpen] = useState(defaultOpen)
  useEffect(() => {
    const check = () => {
      if (decodeURIComponent(window.location.hash.slice(1)) === id) setOpen(true)
    }
    check()
    window.addEventListener("hashchange", check)
    return () => window.removeEventListener("hashchange", check)
  }, [id])
  return (
    <section id={id} data-settings-card="" data-collapsible-card="" data-open={open ? "true" : "false"} className="set-card scroll-mt-5">
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
          className="ai-fold-head"
        >
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{title}</span>
          {summary != null && (
            <span data-fold-summary="" className="min-w-0 truncate text-xs tabular-nums text-muted-foreground">
              {summary}
            </span>
          )}
          <ChevronDown aria-hidden="true" className="ai-fold-chevron size-4 shrink-0 text-ink-3" />
        </button>
      </h3>
      {open && (
        <div id={bodyId} data-fold-body="" className="ai-fold-body">
          {children}
        </div>
      )}
    </section>
  )
}
