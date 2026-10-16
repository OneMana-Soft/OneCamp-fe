"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { memo } from "react"
import { getNameInitials } from "@/lib/utils/format/getNameIntials"
import { cn } from "@/lib/utils/helpers/cn"
import { useNamedWorkspace } from "@/hooks/useWorkspaceName"

export const OrgAvatarNav = memo(() => {
    const orgName = useNamedWorkspace()
    const orgNameInitials = getNameInitials(orgName)

    return (
        <Avatar className="h-8 w-8 hover:cursor-pointer rounded-md">
            <AvatarImage src="/logo.svg" alt={orgName || "Organisation"} />
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
