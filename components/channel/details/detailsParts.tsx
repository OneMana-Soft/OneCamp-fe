"use client"

import * as React from "react"
import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * A section of the channel's Details sheet (design v3 chat, C49): a sentence-
 * case 13/590 title over a card (r12, e1) of rows between hairlines. Shared
 * so a section drawn elsewhere (the AI teammates, a weekly report) has the
 * same title and card as About or Members.
 */
export function DetailsSection({ title, action, children, tone }: { title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; tone?: "danger" }) {
    const id = useId()
    return (
        <section aria-labelledby={id} className="space-y-2">
            <div className="flex min-h-7 items-center justify-between gap-3 px-1">
                <h3 id={id} className={cn("text-ui-sm font-semibold", tone === "danger" ? "text-danger-ink" : "text-ink-2")}>{title}</h3>
                {action}
            </div>
            <div data-details-card="" className="divide-y divide-line rounded-xl bg-raised shadow-e1">{children}</div>
        </section>
    )
}

/** A row of a card: at least 56px, its words on the left and its control on the right. */
export function DetailsRow({ icon, label, description, controlId, children }: { icon?: React.ReactNode; label: React.ReactNode; description?: React.ReactNode; controlId?: string; children?: React.ReactNode }) {
    return (
        <div data-details-row="" className="flex min-h-14 items-center gap-3 px-3 py-2.5">
            {icon && <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sunken text-ink-2 [&_svg]:size-4">{icon}</span>}
            <div className="min-w-0 flex-1">
                {controlId ? (
                    <Label htmlFor={controlId} className="text-ui font-medium text-ink">{label}</Label>
                ) : (
                    <div className="text-ui font-medium text-ink">{label}</div>
                )}
                {description && <p className="text-meta text-ink-3 text-pretty">{description}</p>}
            </div>
            {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
        </div>
    )
}

/**
 * A destructive action that asks in place (C54): the button turns into the
 * question and its two answers, inside the card. No dialog over a sheet.
 * Shared by the channel's Details and a DM's or group's (Leave).
 */
export function InlineConfirm({ label, question, warning, confirmLabel, onConfirm, busy, disabled, description }: {
    label: string
    question: string
    warning?: string
    confirmLabel: string
    onConfirm: () => void
    busy?: boolean
    disabled?: boolean
    description?: string
}) {
    const [asking, setAsking] = useState(false)
    if (!asking) {
        return (
            <DetailsRow label={label} description={description}>
                <Button variant="destructive" size="sm" disabled={disabled} onClick={() => setAsking(true)}>{label}</Button>
            </DetailsRow>
        )
    }
    return (
        <div role="group" aria-label={question} className="space-y-2 px-3 py-3 animate-fade-in">
            <p className="text-ui font-medium text-ink">{question}</p>
            {warning && <p className="text-meta text-warning-ink">{warning}</p>}
            <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setAsking(false)} autoFocus>Cancel</Button>
                <Button variant="destructive" size="sm" aria-busy={busy || undefined} onClick={onConfirm}>{confirmLabel}</Button>
            </div>
        </div>
    )
}
