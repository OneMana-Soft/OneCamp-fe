"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import * as React from "react"
import { memo } from "react"
import { getNameInitials } from "@/lib/utils/format/getNameIntials"
import { cn } from "@/lib/utils/helpers/cn"

export const OrgAvatarNav = memo(() => {
    const orgName = process.env.NEXT_PUBLIC_ORG_NAME
    const orgNameInitials = getNameInitials(orgName)

    return (
        <Avatar className="h-8 w-8 hover:cursor-pointer rounded-md">
            <AvatarImage src="/logo.svg" alt={orgName || "Organization"} />
            <AvatarFallback
                className={cn(
                    "rounded-md text-xs font-semibold",
                    "bg-primary text-primary-foreground",
                )}
            >
                {orgNameInitials}
            </AvatarFallback>
        </Avatar>
    )
})

OrgAvatarNav.displayName = "OrgAvatarNav"
