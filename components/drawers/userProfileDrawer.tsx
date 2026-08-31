"use client"

import * as React from "react"
import {
    Calendar,
    CircleUser,
    ClipboardCheck,
    Hash,
    LogOut,
    Moon,
    Sun,
    Sparkles,
    Zap,
    MailPlus,
    LayoutDashboard,
    File as FileIcon,
} from "@/lib/icons"
import { Plug } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useLogout } from "@/hooks/useLogout"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { useCapabilities } from "@/hooks/useCapabilities"
import { useAIAvailable } from "@/hooks/useClientConfig"
import { CAP_AGENT_MANAGE, CAP_WORKFLOW_MANAGE, CAP_INVITATION_CREATE } from "@/services/capabilityService"
import { MemberInviteDialog } from "@/components/invite/MemberInviteDialog"
import { useState } from "react"

import { cn } from "@/lib/utils/helpers/cn"
import { Switch } from "@/components/ui/switch"
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

interface DrawerItemProps {
    icon: LucideIcon
    label: string
    onClick: () => void
    destructive?: boolean
    trailing?: React.ReactNode
}

/**
 * DrawerItem — single tappable row matching the rest of the mobile UI's
 * 48px touch target with Tailwind active state for press feedback.
 */
function DrawerItem({ icon: Icon, label, onClick, destructive, trailing }: DrawerItemProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "w-full h-12 flex items-center gap-3 px-3 rounded-md",
                "text-left text-sm font-medium transition-colors",
                "active:bg-accent",
                destructive
                    ? "text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10"
                    : "text-foreground hover:bg-accent/60 focus-visible:bg-accent/60",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            )}
        >
            <Icon
                className={cn(
                    "h-5 w-5 shrink-0",
                    destructive ? "text-destructive" : "text-muted-foreground",
                )}
                strokeWidth={1.75}
            />
            <span className="flex-1 truncate">{label}</span>
            {trailing}
        </button>
    )
}

export function UserProfileDrawer({ drawerOpenState, setOpenState }: ProfileDrawerProps) {
    const { logout } = useLogout()
    const router = useRouter()
    const { theme, setTheme } = useTheme()
    const { can } = useCapabilities()
    const aiAvailable = useAIAvailable()
    const [inviteOpen, setInviteOpen] = useState(false)

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
                    <DrawerItem
                        icon={Hash}
                        label="Channels"
                        onClick={() => handleNavigate("/app/channel")}
                    />
                    <DrawerItem
                        icon={ClipboardCheck}
                        label="My Tasks"
                        onClick={() => handleNavigate("/app/myTask")}
                    />
                    <DrawerItem
                        icon={Calendar}
                        label="Calendar"
                        onClick={() => handleNavigate("/app/calendar")}
                    />
                    <DrawerItem
                        icon={FileIcon}
                        label="Docs"
                        onClick={() => handleNavigate("/app/doc")}
                    />
                    <DrawerItem
                        icon={LayoutDashboard}
                        label="Boards"
                        onClick={() => handleNavigate("/app/board")}
                    />

                    <div className="my-2 border-t border-border/60" />

                    <DrawerItem
                        icon={CircleUser}
                        label="My Profile"
                        onClick={() => handleNavigate("/app/profile")}
                    />

                    <DrawerItem
                        icon={Plug}
                        label="Connectors"
                        onClick={() => handleNavigate("/app/settings/connectors")}
                    />

                    {can(CAP_WORKFLOW_MANAGE) && (
                        <DrawerItem
                            icon={Zap}
                            label="Workflows"
                            onClick={() => handleNavigate("/app/settings/workflows")}
                        />
                    )}

                    {/* The agent builder, and with it the shared skill library, had no
                        entry anywhere in the interface. The page existed and was gated
                        exactly like Workflows above, but the only way to reach it was the
                        command palette or a typed URL, so for most people it did not
                        exist. Gated on AI as well as the capability, so the AI-free
                        edition never shows a door to a page that tells you to go away. */}
                    {aiAvailable && can(CAP_AGENT_MANAGE) && (
                        <DrawerItem
                            icon={Sparkles}
                            label="Agents & skills"
                            onClick={() => handleNavigate("/app/settings/agents")}
                        />
                    )}

                    {can(CAP_INVITATION_CREATE) && (
                        <DrawerItem
                            icon={MailPlus}
                            label="Invite people"
                            onClick={() => {
                                setInviteOpen(true)
                                closeDrawer()
                            }}
                        />
                    )}

                    <DrawerItem
                        icon={isDark ? Moon : Sun}
                        label="Dark mode"
                        onClick={() => setTheme(isDark ? "light" : "dark")}
                        trailing={
                            <Switch
                                checked={isDark}
                                onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
                                onClick={(e) => e.stopPropagation()}
                                aria-label="Toggle dark mode"
                            />
                        }
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
        </>
    )
}
