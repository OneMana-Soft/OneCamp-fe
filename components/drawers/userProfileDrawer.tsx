"use client"
import dynamic from "next/dynamic"
import { useDeferredValue, useState } from "react"

import {
    Bell,
    Bookmark,
    Calendar,
    ClipboardCheck,
    Focus,
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
    Smile,
    File as FileIcon, Inbox as InboxIcon } from "@/lib/icons"
import { Plug } from "lucide-react"
import { useLogout } from "@/hooks/useLogout"
import { useAppRouter } from "@/lib/navigation/appRouter"
import { useTheme } from "next-themes"
import { ThemeSwatches } from "@/components/navigationBar/appearanceControl"
import { useCapabilities } from "@/hooks/useCapabilities"
import { useAIAvailable } from "@/hooks/useClientConfig"
import { CAP_AGENT_MANAGE, CAP_WORKFLOW_MANAGE, CAP_INVITATION_CREATE } from "@/services/capabilityService"
import { LazyMemberInviteDialog } from "@/components/invite/LazyMemberInviteDialog"
import { pauseMenuLabel } from "@/lib/notifications/pause"
// The pause menu loads with its first open: the shell carried it on every page.
const PauseNotificationsDialog = dynamic(() => import("@/components/notifications/PauseNotificationsDialog").then((m) => m.PauseNotificationsDialog), { ssr: false })
import { usePauseNotifications } from "@/hooks/usePauseNotifications"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { UserProfileInterface } from "@/types/user"
import { useDispatch, useSelector } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"
import type { RootState } from "@/store/store"
import { displayNameOf } from "@/lib/personName"
import { useStatusIsExpired } from "@/hooks/useStatusIsExpired"
import { useEmojiMartData } from "@/hooks/reactions/useEmojiMartData"
import { findEmojiMartEmojiByEmojiID } from "@/lib/utils/reaction/findReaction"
import { useFocusTime } from "@/hooks/useFocusTime"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { PhoneSelfAvatar } from "@/components/navigationBar/mobile/phoneSelfAvatar"
import { DrawerItem } from "@/components/drawers/drawerItem"
import { phoneSheet } from "@/components/drawers/phoneSheet"
import { youStatusLine } from "@/components/drawers/youStatusLine"
import { destinationHue } from "@/lib/destinationHue"
import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import { WorkspaceName } from "@/hooks/useWorkspaceName"
import { useSheetHandoff } from "@/components/drawers/sheetHandoff"
import { tablesPath } from "@/lib/tables/route"

interface ProfileDrawerProps {
    drawerOpenState: boolean
    setOpenState: (state: boolean) => void
}

type ThemeChoice = "light" | "dark" | "system"

/**
 * Theme as one 44px row with a three-way choice (design v3, M2 and Ph3): sun,
 * moon, Auto. It was a "Dark mode" switch, which could not say "match my
 * device", the default.
 */
function ThemeRow({ value, onChange }: { value: ThemeChoice; onChange: (v: ThemeChoice) => void }) {
    return (
        <div data-theme-row="" className="w-full h-11 flex items-center gap-3 px-3">
            <span id="drawer-theme-label" className="flex-1 truncate text-body leading-5">Theme</span>
            <SegmentedControl<ThemeChoice>
                aria-labelledby="drawer-theme-label"
                value={value}
                onValueChange={onChange}
                className="flex-nowrap rounded-[7px] bg-press p-0.5"
                itemClassName="h-7 min-w-9 px-2 text-2xs md:h-7 rounded-[5px] data-[state=checked]:bg-raised data-[state=checked]:ring-0 data-[state=checked]:shadow-e1"
                options={[
                    { value: "light", label: <span className="sr-only">Light</span>, icon: Sun, title: "Light" },
                    { value: "dark", label: <span className="sr-only">Dark</span>, icon: Moon, title: "Dark" },
                    { value: "system", label: "Auto", title: "Match my device" },
                ]}
            />
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
        <p className="px-3 pt-3 pb-1.5 text-2xs font-medium text-ink-3">
            {label}
        </p>
    )
}

export function UserProfileDrawer({ drawerOpenState, setOpenState }: ProfileDrawerProps) {
    const { logout } = useLogout()
    const router = useAppRouter()
    const dispatch = useDispatch()
    const { theme, setTheme } = useTheme()
    const { can } = useCapabilities()
    const aiAvailable = useAIAvailable()
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const isAdmin = !!selfProfile.data?.data.user_is_admin
    // What the sheet hands over to: the pause sheet or the invite dialog
    // (components/drawers/sheetHandoff).
    const { handoff, handTo, handBack, sheetOpen, onSheetOpenChange } = useSheetHandoff<"pause" | "invite">(() => setOpenState(false))
    // The pause sheet, mounted from its first open on, so it can animate away.
    const [pauseUsed, setPauseUsed] = useState(false)
    if (handoff === "pause" && !pauseUsed) setPauseUsed(true)
    const { pausedUntil, focusUntil } = usePauseNotifications()
    const focus = useFocusTime()
    const me = selfProfile.data?.data

    // Your status text, as the rest of the app reads it: Redux's copy, and
    // nothing once it has expired (the server never says it did).
    const myStatus = useSelector((state: RootState) => (me?.user_uuid ? state.users.usersStatus[me.user_uuid]?.emojiStatus : undefined))
    const cached = myStatus?.status_user_emoji_id ? myStatus : null
    const expired = useStatusIsExpired(cached ?? null)
    const status = cached && !expired ? cached : null
    const emojiData = useEmojiMartData(!!status?.status_user_emoji_id)
    const emoji = status ? findEmojiMartEmojiByEmojiID(emojiData.data, status.status_user_emoji_id ?? "")?.skins?.[0]?.native : null
    const statusLine = youStatusLine({ focusUntil, pausedUntil, emoji, text: status?.status_user_emoji_desc })

    // Deferred (fluid-16): drawers/accountSheetOpen.test.tsx
    const open = useDeferredValue(drawerOpenState, false)
    const closeDrawer = () => setOpenState(false)

    const handleNavigate = (path: string) => {
        router.push(path)
        closeDrawer()
    }

    const themeChoice: ThemeChoice = theme === "dark" || theme === "light" ? theme : "system"

    return (
        <>
        <Drawer detent="large" onOpenChange={onSheetOpenChange} open={sheetOpen(open)}>
            <DrawerContent {...phoneSheet}>
                <DrawerHeader className="sr-only">
                    <DrawerTitle>
                        <WorkspaceName />
                    </DrawerTitle>
                    <DrawerDescription>App menu</DrawerDescription>
                </DrawerHeader>
                <div className="px-2 pt-1 pb-5 space-y-px">
                    {/* You first (design v3, Ph3): who you are and the state
                        you are in, and the three things you set about
                        yourself. Your avatar on the Home bar opens here. */}
                    <DrawerSection label="You" />
                    <button
                        type="button"
                        data-you-row=""
                        aria-label={`Your profile: ${displayNameOf(me)}, ${statusLine}`}
                        onClick={() => handleNavigate("/app/profile")}
                        className="w-full min-h-14 flex items-center gap-3 px-3 py-2 rounded-[10px] text-left transition-colors hover:bg-hover active:bg-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                    >
                        <PhoneSelfAvatar profile={me} size={32} focus={!!focusUntil} paused={!!pausedUntil && !focusUntil} ring="var(--pop)" />
                        <span className="flex-1 min-w-0">
                            <span className="block truncate text-body leading-5 font-medium text-ink">{displayNameOf(me)}</span>
                            <span data-you-status="" className="block truncate text-2xs text-ink-3">
                                {focusUntil ? <><b className="font-medium text-brand-text">In focus</b>{statusLine.slice("In focus".length)}</> : statusLine}
                            </span>
                        </span>
                    </button>
                    {/* Your status, as the desktop's profile menu offers it
                        (hub P2/P3). A phone had no way to set one short of
                        Settings > Profile. The editor is the app's own layer,
                        so the sheet can close behind it. */}
                    <DrawerItem
                        icon={Smile}
                        neutralTile
                        label={status ? "Change your status" : "Set a status"}
                        onClick={() => {
                            closeDrawer()
                            dispatch(openUI({ key: "userStatusUpdate", data: { userUUID: "" } }))
                        }}
                    />
                    <DrawerItem
                        icon={Focus}
                        neutralTile
                        label={focusUntil ? "End focus time" : "Start focus time"}
                        description={focusUntil ? statusLine : "1 hour, notifications held"}
                        disabled={focus.busy}
                        onClick={() => void (focusUntil ? focus.end() : focus.start()).then((ok) => ok && closeDrawer())}
                    />
                    <DrawerItem
                        icon={BellOff}
                        neutralTile
                        label={pauseMenuLabel(pausedUntil, null)}
                        onClick={() => handTo("pause")}
                    />
                    <ThemeRow value={themeChoice} onChange={setTheme} />
                    {/* The theme colour, the account menu's swatches at a finger's
                        44px (hub P2's AppearanceControl, shared). */}
                    <div data-theme-swatches="" className="flex h-11 items-center gap-3 px-3">
                        <span className="shrink-0 text-body leading-5">Colour</span>
                        <ThemeSwatches touch />
                    </div>

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
                        label="Mail"
                        hue={destinationHue("/app/mail")}
                        onClick={() => handleNavigate("/app/mail")}
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
                        hue={destinationHue(tablesPath())}
                        onClick={() => handleNavigate(tablesPath())}
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
                        hue={destinationHue("/app/inbox?tab=ai")}
                                onClick={() => handleNavigate("/app/inbox?tab=ai")}
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
                            onClick={() => handTo("invite")}
                        />
                    )}

                    <div className="mx-3 my-2 h-px bg-line" />

                    <DrawerItem
                        icon={LogOut}
                        label="Sign out"
                        onClick={logout}
                        destructive
                    />
                </div>
            </DrawerContent>
        </Drawer>
        <LazyMemberInviteDialog open={handoff === "invite"} onOpenChange={handBack} />
        {handoff === "pause" || pauseUsed ? <PauseNotificationsDialog open={handoff === "pause"} onOpenChange={handBack} /> : null}
        </>
    )
}
