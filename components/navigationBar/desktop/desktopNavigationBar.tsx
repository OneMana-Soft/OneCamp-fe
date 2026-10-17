"use client"

import { displayNameOf } from "@/lib/personName"
import { useLaterList } from "@/hooks/useLater";
import React, { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/helpers/cn";
import type { DesktopChildrenNavType } from "@/types/nav";
import { useHydrateUserSidebar } from "@/hooks/useHydrateUserSidebar";
import { app_channel_path, app_chat_path, app_doc_path, app_grp_chat_path, app_project_path } from "@/types/paths";
import { openUI } from "@/store/slice/uiSlice";
import { getOtherUserId } from "@/lib/utils/getOtherUserId";
import type { RootState } from "@/store/store";
import { sortChannelsByName } from "@/lib/utils/sortChannelList";
import { isMutedChannel, starredChannelRows } from "@/lib/nav/sidebarChannels";
import { rowSignal, sectionSignal } from "@/lib/nav/sidebarSignal";
import { sortChatList } from "@/lib/utils/sortChatList";
import { isExternalUser } from "@/lib/utils/isExternalUser";
import { buildPrimaryNavLinks, inboxBadgeCount } from "@/lib/nav/primaryNavLinks";
import { partitionNav } from "@/lib/nav/focusMode";
import { useSidebarDisclosure } from "@/lib/nav/sidebarDisclosure";
import { userDisplayName } from "@/lib/utils/userDisplayName"
import {
    SIDEBAR_COLLAPSED_COOKIE,
    SIDEBAR_DEFAULT_PX,
    SIDEBAR_RAIL_PX,
    SIDEBAR_WIDTH_COOKIE,
    atSidebarBound,
    clampSidebarWidth,
    savedSidebar,
} from "@/lib/ui/sidebarSize";
import { SidebarHeader } from "@/components/navigationBar/desktop/SidebarHeader";
import { SidebarSearchRow } from "@/components/navigationBar/desktop/SidebarSearchRow";
import { PrimaryNav, SidebarSection } from "@/components/navigationBar/desktop/desktopSideNavigationBar";
import { SidebarFoot } from "@/components/navigationBar/desktop/SidebarFoot";
import { SidebarRail } from "@/components/navigationBar/desktop/SidebarRail";
import { FootPill } from "@/components/error/OfflineNotice";
import { SidebarSkeleton } from "@/components/protectedRoute/SkeletonShell";
import { useNudgeCount } from "@/hooks/useNudgeCount";
import { SettingsNav, SettingsRailItems, rememberAppRoute } from "@/components/navigationBar/desktop/SettingsNav";
import { inSettingsShell } from "@/lib/adminSections";
import { TabletRail } from "@/components/navigationBar/tablet/TabletRail";
import { TabletListPanel } from "@/components/navigationBar/tablet/TabletListPanel";
import { useShellBand } from "@/components/navigationBar/tablet/useShellBand";
import { isTabletBand } from "@/lib/ui/shellBand";
import { DocsSection } from "@/components/docTree/DocsSection";
import { rememberDocIcon } from "@/lib/docLook";

/** The tablet's rail and its channel list, in pixels (design v3, mobile T2 and T3). */
const TABLET_RAIL_PX = 72
const TABLET_LIST_PX = 340

const setCookie = (name: string, value: string) => {
    document.cookie = `${name}=${value}; path=/; max-age=31536000`
}

/** The sidebar's middle scrolls; a 12px fade shows where there is more. */
function useScrollFades() {
    const ref = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const el = ref.current
        if (!el) return
        const update = () => {
            el.dataset.moreAbove = el.scrollTop > 1 ? "true" : "false"
            el.dataset.moreBelow = el.scrollTop + el.clientHeight < el.scrollHeight - 1 ? "true" : "false"
        }
        update()
        el.addEventListener("scroll", update, { passive: true })
        const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update)
        ro?.observe(el)
        if (el.firstElementChild) ro?.observe(el.firstElementChild)
        return () => {
            el.removeEventListener("scroll", update)
            ro?.disconnect()
        }
    }, [])
    return ref
}

/**
 * The seam between the sidebar and the sheet is its resize handle (S2): drag
 * from 216 to 320px, double-click for 248, arrow keys step 8px. It shakes 2px
 * once at a bound, and a 22px readout says the width while it is dragged.
 * The width snaps; it never animates (it would lay the sheet out each frame).
 */
function SidebarSeam({ width, onWidth, onDone }: { width: number; onWidth: (w: number) => void; onDone: (w: number) => void }) {
    const [dragging, setDragging] = useState(false)
    const [shake, setShake] = useState(false)
    const last = useRef(width)
    const bump = () => {
        setShake(false)
        requestAnimationFrame(() => setShake(true))
    }
    const set = (asked: number) => {
        const bound = atSidebarBound(asked)
        const w = clampSidebarWidth(asked)
        if (bound && w === last.current) {
            if (!shake) bump()
        }
        last.current = w
        onWidth(w)
    }
    return (
        <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the sidebar"
            aria-valuenow={width}
            aria-valuemin={216}
            aria-valuemax={320}
            tabIndex={0}
            data-dragging={dragging ? "true" : undefined}
            data-shake={shake ? "true" : undefined}
            className="shell-seam"
            onAnimationEnd={() => setShake(false)}
            onDoubleClick={() => {
                onWidth(SIDEBAR_DEFAULT_PX)
                onDone(SIDEBAR_DEFAULT_PX)
            }}
            onKeyDown={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault()
                    const w = clampSidebarWidth(width + (e.key === "ArrowLeft" ? -8 : 8))
                    if (w === width) bump()
                    onWidth(w)
                    onDone(w)
                }
            }}
            onPointerDown={(e) => {
                if (e.button !== 0) return
                e.currentTarget.setPointerCapture(e.pointerId)
                last.current = width
                setDragging(true)
            }}
            onPointerMove={(e) => {
                if (!dragging) return
                set(e.clientX)
            }}
            onPointerUp={(e) => {
                if (!dragging) return
                e.currentTarget.releasePointerCapture(e.pointerId)
                setDragging(false)
                onDone(last.current)
            }}
        >
            <i />
            {dragging && <span className="shell-seam-readout">{width} px</span>}
        </div>
    )
}

export function DesktopNavigationBar({ children }: Readonly<{ children: React.ReactNode }>) {
    const dispatch = useDispatch();
    const pathname = usePathname()
    const path = useMemo(() => pathname.split('/'), [pathname])

    // The sidebar as this person left it, in pixels (lib/ui/sidebarSize).
    // The shell mounts only in the browser, after the profile has loaded, so
    // the cookie is read on the first render: no frame at another width.
    const [{ width, collapsed }, setSidebar] = useState(() =>
        typeof document === "undefined" ? { width: SIDEBAR_DEFAULT_PX, collapsed: false } : savedSidebar(document.cookie, window.innerWidth),
    )
    const setWidth = useCallback((w: number) => setSidebar((s) => ({ ...s, width: w })), [])
    const setCollapsed = useCallback((c: boolean) => {
        setSidebar((s) => ({ ...s, collapsed: c }))
        setCookie(SIDEBAR_COLLAPSED_COOKIE, JSON.stringify(c))
    }, [])

    // ⌘\ folds the sidebar to the rail and opens it again; instant (a key).
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            // A chord, not text: it works from a composer too, as in Linear.
            if (!(e.metaKey || e.ctrlKey) || e.key !== "\\" || e.altKey || e.shiftKey) return
            e.preventDefault()
            setSidebar((s) => {
                setCookie(SIDEBAR_COLLAPSED_COOKIE, JSON.stringify(!s.collapsed))
                return { ...s, collapsed: !s.collapsed }
            })
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [])

    // A tablet (a coarse pointer from 640 to 1279) gets its own shell: the
    // 72px rail of labelled places, and the channel list beside or over the
    // page (design v3, mobile T1 to T3).
    const band = useShellBand()
    const tablet = isTabletBand(band)
    const wide = band === "tablet-wide"
    const inChannel = path[2] === "channel" && !!path[3]
    // Wide: the list sits beside a channel unless the person hid it.
    // Compact: it slides over the page when asked, and goes once a channel is picked.
    const [listHidden, setListHidden] = useState(false)
    const [listOpen, setListOpen] = useState(false)
    useEffect(() => setListOpen(false), [pathname])
    const docked = tablet && wide && inChannel && !listHidden
    const toggleList = useCallback(() => (wide ? setListHidden((h) => !h) : setListOpen((o) => !o)), [wide])
    const closeList = useCallback(() => (wide ? setListHidden(true) : setListOpen(false)), [wide])

    // Where the sheet starts and ends, for whatever floats in its corners
    // (CornerStack) and the right panel's own inset.
    useLayoutEffect(() => {
        const root = document.documentElement
        const left = tablet ? TABLET_RAIL_PX + (docked ? TABLET_LIST_PX + 8 : 0) : collapsed ? SIDEBAR_RAIL_PX : width
        root.style.setProperty("--shell-left-inset", `${left}px`)
        return () => {
            root.style.removeProperty("--shell-left-inset")
        }
    }, [collapsed, width, tablet, docked])

    // Springs and fades are for what changes while you watch, not for the
    // first paint: they start a moment after the sidebar arrives.
    const [settled, setSettled] = useState(false)
    useEffect(() => {
        const t = window.setTimeout(() => setSettled(true), 800)
        return () => window.clearTimeout(t)
    }, [])

    const [isProjectOpen, setIsProjectOpen] = useSidebarDisclosure("projects", true);
    const [isChannelOpen, setIsChannelOpen] = useSidebarDisclosure("channels", true);
    const [isChatOpen, setIsChatOpen] = useSidebarDisclosure("chats", true);
    const [isFavOpen, setIsFavOpen] = useSidebarDisclosure("favorites", true);
    const [isDocsOpen, setIsDocsOpen] = useSidebarDisclosure("docs", true);

    // Seeds the sidebar's lists and badges, as every layout must.
    const userSideNav = useHydrateUserSidebar()
    const self = userSideNav.data?.data
    const userSidebarState = useSelector((state: RootState) => state.users.userSidebar)
    const channelCallStatus = useSelector((state: RootState) => state.channel.channelCallStatus);
    const chatCallStatus = useSelector((state: RootState) => state.chat.chatCallStatus);
    const nudges = useNudgeCount()

    const totalDMUnread = useMemo(() =>
        (userSidebarState.userChats || []).reduce((acc, chat) => acc + (chat.dm_unread || 0), 0),
        [userSidebarState.userChats]
    );
    const totalChannelUnread = useMemo(() =>
        (userSidebarState.userChannels || []).reduce((acc, channel) => acc + (channel.unread_post_count || 0), 0),
        [userSidebarState.userChannels]
    );
    // The rails' DMs count the conversations with something unread (Slack's
    // DMs tab does, SN-19), not every message in them.
    const unreadDMs = useMemo(() =>
        (userSidebarState.userChats || []).filter((chat) => (chat?.dm_unread || 0) > 0).length,
        [userSidebarState.userChats]
    );

    const isAdmin = !!self?.user_is_admin
    const laterDue = useLaterList("open").data?.data.due ?? 0
    const counts = {
        channel: totalChannelUnread,
        dm: totalDMUnread,
        activity: userSidebarState.totalUnreadActivityCount,
        laterDue,
        tasksDue: self?.user_overdue_task_count ?? 0,
        urgentNudges: nudges,
    }

    const navLinks = useMemo(
        () => buildPrimaryNavLinks(path, counts, isAdmin),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [path, counts.channel, counts.dm, counts.activity, counts.laterDue, counts.tasksDue, counts.urgentNudges, isAdmin],
    );
    // Docs are a section in the full sidebar and an item in the rails, which
    // have no sections (lib/nav/focusMode): the rails take primary, the full
    // sidebar's rows leave Docs to its section.
    const { primary: rows, sections, folded: more } = useMemo(() => partitionNav(navLinks), [navLinks]);
    const primary = useMemo(() => [...rows, ...sections], [rows, sections]);

    // A live arrival in Inbox while the window is focused and Inbox isn't
    // open: its badge rings once (N1).
    const inboxCount = inboxBadgeCount(counts)
    const [inboxPulse, setInboxPulse] = useState(false)
    const prevInbox = useRef(inboxCount)
    useEffect(() => {
        const rose = inboxCount > prevInbox.current
        prevInbox.current = inboxCount
        if (!rose || !settled || path[2] === "inbox" || !document.hasFocus()) return
        setInboxPulse(true)
        const t = window.setTimeout(() => setInboxPulse(false), 1200)
        return () => window.clearTimeout(t)
    }, [inboxCount, settled, path])

    const projectRows: DesktopChildrenNavType[] = (userSidebarState.userProjects || []).filter(Boolean).map((p) => ({
        title: p.project_name,
        path: `${app_project_path}/${p.project_uuid}`,
        variant: (path.length > 3 && path[2] === "project" && path[3] == p.project_uuid) ? "sidebarActive" : "ghost",
        project_uuid: p.project_uuid,
    }))

    const favChannelUUIDs = new Set((userSidebarState.userFavChannels || []).map(f => f.ch_uuid));
    const channelRow = (c: (typeof userSidebarState.userChannels)[number]): DesktopChildrenNavType => ({
        title: c.ch_name,
        unread_count: c?.unread_post_count,
        kind: "channel",
        hue_id: c.ch_uuid,
        mentions: c?.unread_mention_count,
        path: `${app_channel_path}/${c.ch_uuid}`,
        variant: (path.length > 3 && path[3] == c.ch_uuid) ? "sidebarActive" : "ghost",
        isCallActive: channelCallStatus[c.ch_uuid]?.active || false,
        isPrivate: !!c.ch_private,
        muted: isMutedChannel(c),
    })
    // A starred channel is its Channels row (lib/nav/sidebarChannels), in
    // starred order; starred docs follow, in the order they were starred (B5).
    // Channels are A to Z (D-S2): no row moves when something arrives in it.
    const starredDocRows: DesktopChildrenNavType[] = (userSidebarState.userStarred || [])
        .filter((p) => p && p.resource_kind === "doc")
        .map((p) => {
            // Its icon, for the lists that name a doc without it (lib/docLook).
            rememberDocIcon(p.resource_uuid, p.icon)
            return {
            title: p.title || "Untitled",
            path: p.href || `${app_doc_path}/${p.resource_uuid}`,
            kind: "doc",
            hue_id: p.resource_uuid,
            doc_icon: p.icon,
            variant: path.length > 3 && path[2] === "doc" && path[3] === p.resource_uuid ? "sidebarActive" : "ghost",
            } satisfies DesktopChildrenNavType
        })
    const starredRows = [
        ...starredChannelRows(userSidebarState.userChannels || [], userSidebarState.userFavChannels || []).map(channelRow),
        ...starredDocRows,
    ]
    const channelRows = sortChannelsByName((userSidebarState.userChannels || []).filter((c) => c && !favChannelUUIDs.has(c.ch_uuid))).map(channelRow)

    const dmRows: DesktopChildrenNavType[] = []
    for (const d of sortChatList((userSidebarState.userChats || []).filter(Boolean))) {
        const others = d.dm_participants.filter((t) => t && t.user_uuid != self?.user_uuid)
        // External users can't be DMed: drop any DM whose only other person is external.
        if (others.length === 1 && isExternalUser(others[0])) continue
        const isGroup = others.length > 1
        let p: string
        let active: boolean
        if (isGroup) {
            p = `${app_grp_chat_path}/${d.dm_grouping_id}`
            active = path.length > 4 && path[4] == d.dm_grouping_id
        } else {
            const u = getOtherUserId(d.dm_grouping_id, self?.user_uuid || '')
            p = `${app_chat_path}/${u}`
            active = path.length > 3 && path[3] == u
        }
        dmRows.push({
            title: others.length == 0 ? displayNameOf(self) || '' : others.map((item) => userDisplayName(item)).join(", "),
            unread_count: d?.dm_unread,
            // Every unread DM is about you: it takes the brand badge.
            badge: true,
            userProfile: others.length == 0 ? d.dm_participants[0] : (others.length == 1 ? others[0] : undefined),
            userParticipants: isGroup ? others : undefined,
            path: p,
            variant: active ? "sidebarActive" : "ghost",
            isCallActive: chatCallStatus[d.dm_grouping_id]?.active || false,
        })
    }

    const scrollRef = useScrollFades()

    // Settings and Admin take the sidebar's place (design v3, admin §1.1):
    // the settings nav, with "Back to app" returning to the last place
    // outside them, which is remembered here as the person moves.
    const settingsShell = inSettingsShell(pathname)
    useEffect(() => {
        if (!inSettingsShell(pathname)) rememberAppRoute(pathname + window.location.search)
    }, [pathname])

    // The full sidebar: in place, or floating in the rail's peek.
    const sidebarIn = (onPin?: () => void) => settingsShell ? (
        <>
            <Suspense fallback={null}>
                <SettingsNav isAdmin={isAdmin} />
            </Suspense>
            <FootPill />
        </>
    ) : (
        <>
            <SidebarHeader isAdmin={isAdmin} onCollapse={() => setCollapsed(true)} onPin={onPin} />
            <SidebarSearchRow />
            <PrimaryNav links={rows} more={more} inboxPulse={inboxPulse} />
            <div ref={scrollRef} className="shell-scroll mt-0.5">
                {/* Until the sidebar's data answers, its sections are skeleton
                    rows at the real heights (mock M1), never a spinner. */}
                {!userSideNav.data ? <SidebarSkeleton /> : null}
                <div hidden={!userSideNav.data}>
                    {/* Starred only when something is; five, then "Show N more",
                        so it never pushes the chat sections off the first
                        screen (design review PG1-02). */}
                    <SidebarSection title="Starred" open={isFavOpen} setOpen={setIsFavOpen} rows={starredRows} cap={5} />
                    <SidebarSection
                        title="Projects"
                        href={app_project_path}
                        open={isProjectOpen}
                        setOpen={setIsProjectOpen}
                        onAdd={() => dispatch(openUI({ key: 'createProject' }))}
                        addLabel="New project"
                        rows={projectRows}
                        cap={8}
                        invite={{ label: "Start a project", onClick: () => dispatch(openUI({ key: 'createProject' })) }}
                    />
                    <DocsSection
                        open={isDocsOpen}
                        setOpen={setIsDocsOpen}
                        active={path[2] === "doc" && !path[3]}
                        onAdd={() => dispatch(openUI({ key: 'createDoc' }))}
                    />
                    <SidebarSection
                        title="Channels"
                        open={isChannelOpen}
                        setOpen={setIsChannelOpen}
                        onAdd={() => dispatch(openUI({ key: 'createChannel' }))}
                        addLabel="New channel"
                        rows={channelRows}
                        cap={10}
                        invite={{ label: "Create a channel", onClick: () => dispatch(openUI({ key: 'createChannel' })) }}
                    />
                    <SidebarSection
                        title="Direct messages"
                        open={isChatOpen}
                        setOpen={setIsChatOpen}
                        onAdd={() => dispatch(openUI({ key: 'createChatMessage' }))}
                        addLabel="New message"
                        rows={dmRows}
                        cap={8}
                        invite={{ label: "Message someone", onClick: () => dispatch(openUI({ key: 'createChatMessage' })) }}
                    />
                </div>
            </div>
            <FootPill />
            <SidebarFoot />
        </>
    )
    const sidebar = sidebarIn()

    if (tablet) {
        const channelList = (
            <>
                <SidebarSection title="Starred" open={isFavOpen} setOpen={setIsFavOpen} rows={starredRows} cap={5} />
                <SidebarSection title="Channels" open={isChannelOpen} setOpen={setIsChannelOpen} rows={channelRows} bare={starredRows.length === 0} />
            </>
        )
        return (
            // The tablet shell: the rail on the frame, then the sheets. The
            // settings pages keep their own nav as the page's first column.
            <div data-app-viewport="" data-shell="v3" data-band={band} className="app-frame flex h-dvh overflow-hidden">
                <TabletRail
                    primary={primary}
                    more={more}
                    counts={{ channel: totalChannelUnread, dm: unreadDMs, inbox: inboxCount }}
                    isAdmin={isAdmin}
                    onList={inChannel ? toggleList : undefined}
                    listOpen={wide ? docked : listOpen}
                />
                {settingsShell && (
                    <aside aria-label="Settings" className="shell-side h-full w-[240px] flex-none" data-settled="true">
                        <Suspense fallback={null}>
                            <SettingsNav isAdmin={isAdmin} />
                        </Suspense>
                    </aside>
                )}
                {docked && (
                    <div className="flex-none py-2 pr-2">
                        <TabletListPanel mode="docked" onClose={closeList} onAdd={() => dispatch(openUI({ key: 'createChannel' }))}>
                            {channelList}
                        </TabletListPanel>
                    </div>
                )}
                <main data-shell-main="" className="relative z-[1] flex min-w-0 flex-1 flex-col py-2 pr-2">
                    {children}
                </main>
                {!wide && inChannel && listOpen && (
                    <TabletListPanel mode="overlay" onClose={closeList} onAdd={() => dispatch(openUI({ key: 'createChannel' }))}>
                        {channelList}
                    </TabletListPanel>
                )}
            </div>
        )
    }

    return (
        // data-app-viewport: on a tablet, fitted to what the on-screen
        // keyboard leaves while it is up (lib/ui/visualViewport.ts).
        // The frame is neutral graphite with the theme's glow and grain; the
        // top bar is gone (design v3, shell A1), so the sheet runs 8px from
        // every edge.
        <div data-app-viewport="" data-shell="v3" className="app-frame flex h-dvh overflow-hidden">
            {collapsed ? (
                <SidebarRail
                    body={settingsShell ? (
                        <Suspense fallback={null}>
                            <SettingsRailItems isAdmin={isAdmin} />
                        </Suspense>
                    ) : undefined}
                    primary={primary}
                    more={more}
                    places={[...projectRows, ...starredRows]}
                    conversations={{
                        // What the folded Channels section would say: "@2", or a dot.
                        channels: sectionSignal((userSidebarState.userChannels || []).filter(Boolean).map(channelRow)),
                        dms: rowSignal({ badge: true, unread_count: unreadDMs }),
                        on: path[2] === "channel" ? "channel" : path[2] === "chat" ? "chat" : undefined,
                    }}
                    isAdmin={isAdmin}
                    onExpand={() => setCollapsed(false)}
                    peek={(pin) => <aside aria-label="Sidebar" className="shell-side h-full w-full" data-settled="true">{sidebarIn(pin)}</aside>}
                />
            ) : (
                <>
                    <aside
                        aria-label="Sidebar"
                        data-settled={settled ? "true" : undefined}
                        className="shell-side h-full flex-none"
                        // The seam beside it is the sidebar's last 8px: rows end 8px
                        // short of the sheet, which starts at the width.
                        style={{ width: `${width - 8}px`, paddingRight: 0 }}
                    >
                        {sidebar}
                    </aside>
                    <SidebarSeam width={width} onWidth={setWidth} onDone={(w) => setCookie(SIDEBAR_WIDTH_COOKIE, String(w))} />
                </>
            )}
            <main data-shell-main="" className={cn("relative z-[1] flex min-w-0 flex-1 flex-col py-2 pr-2")}>
                {children}
            </main>
        </div>
    );
}
