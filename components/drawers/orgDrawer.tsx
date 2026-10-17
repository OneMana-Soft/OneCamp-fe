"use client"

import { HelpCircle, Shield, UserPlus, Users } from "@/lib/icons"
import { ClipboardList } from "lucide-react"
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import { app_admin, app_project_path, app_team_path } from "@/types/paths"
import { useRouter } from "next/navigation"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { useCapabilities } from "@/hooks/useCapabilities"
import { CAP_INVITATION_CREATE } from "@/services/capabilityService"
import type { UserProfileInterface } from "@/types/user"
import { GetEndpointUrl } from "@/services/endPoints"
import { DrawerItem } from "@/components/drawers/drawerItem"
import { phoneSheet } from "@/components/drawers/phoneSheet"
import { MemberInviteDialog } from "@/components/invite/MemberInviteDialog"
import { PhoneMark } from "@/components/navigationBar/mobile/phoneMark"
import { destinationHue } from "@/lib/destinationHue"
import { useNamedWorkspace } from "@/hooks/useWorkspaceName"
import { useSheetHandoff } from "@/components/drawers/sheetHandoff"

/**
 * Where "Help and docs" goes: the docs on the product's site
 * (NEXT_PUBLIC_PRODUCT_SITE), or nowhere, and no row, on a build without one.
 */
export function helpUrl(): string | null {
    const site = (process.env.NEXT_PUBLIC_PRODUCT_SITE || "").replace(/\/$/, "")
    return site ? `${site}/docs` : null
}

interface OrgDrawerProps {
    drawerOpenState: boolean
    setOpenState: (state: boolean) => void
}

/**
 * The workspace sheet on a phone (design v3, S3 and M1 on a phone, mock M8):
 * the workspace's mark and name with its address, then its places and the
 * workspace menu's items as 44px rows. The desktop opens the same menu from
 * the sidebar header. There is no "switch workspace": one workspace per
 * install.
 */
export function OrgDrawer({ drawerOpenState, setOpenState }: OrgDrawerProps) {
    const router = useRouter()
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const { can } = useCapabilities()
    // The invite dialog is the sheet's own: the sheet hands over to it rather
    // than closing with it (components/drawers/sheetHandoff).
    const { handoff, handTo, handBack, sheetOpen, onSheetOpenChange } = useSheetHandoff<"invite">(() => setOpenState(false))
    const orgName = useNamedWorkspace() || "Your workspace"
    const host = typeof window === "undefined" ? "" : window.location.host
    const help = helpUrl()

    const closeDrawer = () => setOpenState(false)

    const handleNavigate = (path: string) => {
        closeDrawer()
        router.push(path)
    }

    return (
        <>
        <Drawer detent="medium" onOpenChange={onSheetOpenChange} open={sheetOpen(drawerOpenState)}>
            <DrawerContent {...phoneSheet}>
                <DrawerHeader className="sr-only">
                    <DrawerTitle>{orgName}</DrawerTitle>
                    <DrawerDescription>The workspace menu.</DrawerDescription>
                </DrawerHeader>
                <div className="px-2 pt-1 pb-5 space-y-px">
                    <div data-org-head="" className="flex items-center gap-3 px-3 pt-2 pb-3">
                        <PhoneMark className="size-8 rounded-[9px] [&>svg]:size-[18px]" />
                        <div className="min-w-0">
                            <p className="truncate text-body leading-5 font-semibold text-ink">{orgName}</p>
                            {host && <p className="truncate text-2xs text-ink-3">{host}</p>}
                        </div>
                    </div>
                    <DrawerItem
                        icon={ClipboardList}
                        label="Projects"
                        hue={destinationHue(app_project_path)}
                        onClick={() => handleNavigate(app_project_path)}
                    />
                    <DrawerItem
                        icon={Users}
                        label="Teams"
                        hue={destinationHue(app_team_path)}
                        onClick={() => handleNavigate(app_team_path)}
                    />
                    <div className="mx-3 my-2 h-px bg-line" />
                    {can(CAP_INVITATION_CREATE) && (
                        <DrawerItem
                            icon={UserPlus}
                            neutralTile
                            label="Invite people"
                            onClick={() => handTo("invite")}
                        />
                    )}
                    {/* Absent, not greyed, for everyone but an admin. */}
                    {selfProfile.data?.data.user_is_admin && (
                        <DrawerItem
                            icon={Shield}
                            label="Admin"
                            description="Audit, agents, SSO"
                            hue={destinationHue(app_admin)}
                            onClick={() => handleNavigate(app_admin)}
                        />
                    )}
                    {help && (
                        <DrawerItem
                            icon={HelpCircle}
                            neutralTile
                            label="Help and docs"
                            onClick={() => {
                                closeDrawer()
                                window.open(help, "_blank", "noopener,noreferrer")
                            }}
                        />
                    )}
                </div>
            </DrawerContent>
        </Drawer>
        <MemberInviteDialog open={handoff === "invite"} onOpenChange={handBack} />
        </>
    )
}
