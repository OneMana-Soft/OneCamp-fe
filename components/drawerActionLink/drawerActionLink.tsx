import * as React from "react"
import { LucideIcon } from "lucide-react"
import { DrawerItem } from "@/components/drawers/drawerItem"

interface ActionCardPropInterface {
    onLinkClick: () => void
    Icon: LucideIcon
    linkText: string
}

/**
 * DrawerActionLink — thin compatibility wrapper around DrawerItem.
 * New code should import `DrawerItem` directly from
 * `@/components/drawers/drawerItem`.
 */
export const DrawerActionLink = ({ onLinkClick, Icon, linkText }: ActionCardPropInterface) => {
    return <DrawerItem icon={Icon} label={linkText} onClick={onLinkClick} />
}
