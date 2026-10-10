"use client"

import {
    Bell,
    Bookmark,
    Calendar,
    CircleUser,
    ClipboardCheck,
    LogOut,
    Moon,
    BellOff,
    Sun,
    Shield,
    Sparkles,
    Table as TableIcon,
    Zap,
    MailPlus,
    LayoutDashboard,
    File as FileIcon, Inbox as InboxIcon } from "@/lib/icons"
import { Plug } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useLogout } from "@/hooks/useLogout"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { useCapabilities } from "@/hooks/useCapabilities"
import { useAIAvailable } from "@/hooks/useClientConfig"
import { CAP_AGENT_MANAGE, CAP_WORKFLOW_MANAGE, CAP_INVITATION_CREATE } from "@/services/capabilityService"
import { MemberInviteDialog } from "@/components/invite/MemberInviteDialog"
import { PauseNotificationsDialog, pauseMenuLabel } from "@/components/notifications/PauseNotificationsDialog"
import { usePauseNotifications } from "@/hooks/usePauseNotifications"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { UserProfileInterface } from "@/types/user"
import { useState } from "react"

import { Switch } from "@/components/ui/switch"
import { DrawerItem } from "@/components/drawers/drawerItem"
import { destinationHue } from "@/lib/destinationHue"
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"

interface ProfileDrawerProps {
    drawerOpenState: boolean
    setOpenState: (state: boolean) => void
}

/**
 * A row whose control is a switch rather than a destination.
 *
 * It used to be a DrawerItem with the Switch in a trailing slot, which put a
 * button inside a button: invalid markup that React warns about, that gives
 * the row two overlapping hit targets, and that assistive tech reads
 * inconsistently. The switch is the only control, and the visible label names
 * it rather than a duplicate aria-label.
 */
function DrawerSwitchRow({
    icon: Icon,
    label,
    checked,
    onCheckedChange,
}: {
    icon: LucideIcon
    label: string
    checked: boolean
    onCheckedChange: (checked: boolean) => void
}) {
    const labelId = `drawer-switch-${label.replace(/\s+/g, "-").toLowerCase()}`
    return (
        <div className="w-full h-12 flex items-center gap-3 px-3 rounded-md text-sm font-medium">
            <span className="flex size-8 shrink-0 items-center justify-center">
                <Icon className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
            </span>
            <span id={labelId} className="flex-1 truncate">
                {label}
            </span>
            <Switch checked={checked} onCheckedChange={onCheckedChange} aria-labelledby={labelId} />
        </div>
    )
}

/**
 * A heading over a run of rows. The drawer is the whole of mobile navigation
 * beyond five bottom-bar cells, and a flat list of a dozen unrelated rows is
 * what made everything in it read as second class.
 */
function DrawerSection({ label }: { label: string }) {
    return (
        // Sentence case, as the desktop sidebar's groups: a label read on
        // every visit is not a thing to shout (DESIGN.md, "Navigation").
        <p className="px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground">
            {label}
        </p>
    )
}

export function UserProfileDrawer({ drawerOpenState, setOpenState }: ProfileDrawerProps) {
    const { logout } = useLogout()
    const router = useRouter()
    const { theme, setTheme } = useTheme()
    const { can } = useCapabilities()
    const aiAvailable = useAIAvailable()
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const isAdmin = !!selfProfile.data?.data.user_is_admin
    const [inviteOpen, setInviteOpen] = useState(false)
    const [pauseOpen, setPauseOpen] = useState(false)
    const { pausedUntil, focusUntil } = usePauseNotifications()

    const closeDrawer = () => setOpenState(false)

    const handleNavigate = (path: string) => {
        router.push(path)
        closeDrawer()
    }

    const isDark = theme === "dark"

    return (
        <>
        <Drawer onOpenChange={closeDrawer} open={drawerOpenState}>
            <DrawerContent>
                <DrawerHeader className="sr-only">
                    <DrawerTitle className="capitalize">
                        {process.env.NEXT_PUBLIC_ORG_NAME}
                    </DrawerTitle>
                    <DrawerDescription>App menu</DrawerDescription>
                </DrawerHeader>
                <div className="p-3 pb-6 space-y-0.5">
                    {/* Channels used to lead this list while sitting in the bottom bar
                        two centimetres below, spending the drawer's first row on the
                        one destination that never needed it. */}
                    <DrawerSection label="Work" />
                    <DrawerItem
                        icon={ClipboardCheck}
                        label="My tasks"
                        hue={destinationHue("/app/myTask")}
                        onClick={() => handleNavigate("/app/myTask")}
                    />
                    <DrawerItem
                        icon={InboxIcon}
                        label="Inbox"
                        hue={destinationHue("/app/inbox")}
                        onClick={() => handleNavigate("/app/inbox")}
                    />
                    <DrawerItem
                        icon={Bookmark}
                        label="Later"
                        hue={destinationHue("/app/later")}
                        onClick={() => handleNavigate("/app/later")}
                    />
                    <DrawerItem
                        icon={Calendar}
                        label="Calendar"
                        hue={destinationHue("/app/calendar")}
                        onClick={() => handleNavigate("/app/calendar")}
                    />
                    <DrawerItem
                        icon={FileIcon}
                        label="Docs"
                        hue={destinationHue("/app/doc")}
                        onClick={() => handleNavigate("/app/doc")}
                    />
                    <DrawerItem
                        icon={LayoutDashboard}
                        label="Boards"
                        hue={destinationHue("/app/board")}
                        onClick={() => handleNavigate("/app/board")}
                    />
                    {/* Tables is a top-level destination on desktop and had no door at
                        all on a phone: no bottom-bar cell, no drawer row, reachable
                        only by typing the URL. */}
                    <DrawerItem
                        icon={TableIcon}
                        label="Tables"
                        hue={destinationHue("/app/tables")}
                        onClick={() => handleNavigate("/app/tables")}
                    />

                    {aiAvailable && (
                        <>
                            <DrawerSection label="AI" />
                            {/* What the AI did in your name, refusals included. On a
                                phone this was reachable only by knowing to open
                                Activity and then find the last tab. */}
                            <DrawerItem
                                icon={Bell}
                                label="AI activity"
                        hue={destinationHue("/app/activity?tab=ai")}
                                onClick={() => handleNavigate("/app/activity?tab=ai")}
                            />
                            {/* The agent builder, and with it the shared skill library,
                                had no entry anywhere in the interface. The page existed
                                and was gated exactly like Workflows below, but the only
                                way to reach it was the command palette or a typed URL,
                                so for most people it did not exist. Gated on AI as well
                                as the capability, so the AI-free edition never shows a
                                door to a page that tells you to go away. */}
                            {can(CAP_AGENT_MANAGE) && (
                                <DrawerItem
                                    icon={Sparkles}
                                    label="Agents and skills"
                        hue={destinationHue("/app/settings/agents")}
                                    onClick={() => handleNavigate("/app/settings/agents")}
                                />
                            )}
                        </>
                    )}

                    <DrawerSection label="Workspace" />
                    {/* Admin was reachable on a phone only through the org avatar in
                        the top bar, which is not where anyone looks for it. */}
                    {isAdmin && (
                        <DrawerItem
                            icon={Shield}
                            label="Admin"
                        hue={destinationHue("/app/admin")}
                            onClick={() => handleNavigate("/app/admin")}
                        />
                    )}

                    <DrawerItem
                        icon={Plug}
                        label="Connectors"
                        hue={destinationHue("/app/settings/connectors")}
                        onClick={() => handleNavigate("/app/settings/connectors")}
                    />

                    {can(CAP_WORKFLOW_MANAGE) && (
                        <DrawerItem
                            icon={Zap}
                            label="Workflows"
                        hue={destinationHue("/app/settings/workflows")}
                            onClick={() => handleNavigate("/app/settings/workflows")}
                        />
                    )}

                    {can(CAP_INVITATION_CREATE) && (
                        <DrawerItem
                            icon={MailPlus}
                            label="Invite people"
                        hue={destinationHue("invite")}
                            onClick={() => {
                                setInviteOpen(true)
                                closeDrawer()
                            }}
                        />
                    )}

                    <div className="my-2 border-t border-border/60" />

                    <DrawerItem
                        icon={CircleUser}
                        label="Your profile"
                        onClick={() => handleNavigate("/app/profile")}
                    />

                    <DrawerItem
                        icon={BellOff}
                        label={pauseMenuLabel(pausedUntil, focusUntil)}
                        onClick={() => {
                            setPauseOpen(true)
                            closeDrawer()
                        }}
                    />

                    <DrawerSwitchRow
                        icon={isDark ? Moon : Sun}
                        label="Dark mode"
                        checked={isDark}
                        onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
                    />

                    <div className="my-2 border-t border-border/60" />

                    <DrawerItem
                        icon={LogOut}
                        label="Sign out"
                        onClick={logout}
                        destructive
                    />
                </div>
            </DrawerContent>
        </Drawer>
        <MemberInviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
        <PauseNotificationsDialog open={pauseOpen} onOpenChange={setPauseOpen} />
        </>
    )
}
