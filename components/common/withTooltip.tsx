"use client"

import * as React from "react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * An icon control that says what it is on hover, not only to a screen reader.
 *
 * The channel header is seven icons in a row: favourite, notifications, edit,
 * members, call, recordings, memory, extract tasks. Every one carried an
 * aria-label and none of them said anything to somebody looking at it, so the
 * row read as icon soup and the two AI ones in particular were unguessable.
 *
 * The label is the same words as the aria-label, deliberately: a visible name
 * and an announced name that differ is its own bug.
 *
 * Thin on purpose. Tooltip/TooltipTrigger/TooltipContent already exist and a
 * provider is mounted at the app root; this is only here so that adding a
 * ninth icon is one wrapper rather than four lines of boilerplate that the
 * ninth icon does not get.
 */
export function WithTooltip({
    label,
    side = "bottom",
    children,
}: {
    label: string
    side?: "top" | "right" | "bottom" | "left"
    children: React.ReactNode
}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>{children}</TooltipTrigger>
            <TooltipContent side={side}>{label}</TooltipContent>
        </Tooltip>
    )
}
