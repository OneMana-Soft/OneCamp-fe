import * as React from "react"
import { LucideIcon } from "lucide-react"
import { DrawerItem } from "@/components/drawers/drawerItem"

interface ActionCardPropInterface {
    onLinkClick: () => void
    Icon: LucideIcon
    linkText: string
}

/**
 * DrawerDestructiveActionLink — thin compatibility wrapper around DrawerItem
 * with `destructive` enabled. New code should import `DrawerItem` directly.
 */
export const DrawerDestructiveActionLink = ({
    onLinkClick,
    Icon,
    linkText,
}: ActionCardPropInterface) => {
    return <DrawerItem icon={Icon} label={linkText} onClick={onLinkClick} destructive />
}
