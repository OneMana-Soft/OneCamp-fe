"use client";

import { ChevronRight, Columns2, Plus, Star } from "@/lib/icons";
import { useDispatch } from "react-redux";
import { openInSplit } from "@/store/slice/splitSlice";
import { paneFromHref } from "@/lib/split";

import { cn } from "@/lib/utils/helpers/cn";
import {Button} from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {Collapsible, CollapsibleContent, CollapsibleTrigger} from "@/components/ui/collapsible";
import Link from "next/link";
import {DesktopNavType} from "@/types/nav";
import {Badge} from "@/components/ui/badge";
import {DesktopNavigationChatAvatar} from "@/components/navigationBar/desktop/desktopNavigationChatAvatar";
import {DesktopNavigationEmojiStatus} from "@/components/navigationBar/desktop/desktopNavigationChatEmojiStatus";
import { memo } from "react";
import {ColorIcon} from "@/components/colorIcon/colorIcon";
import {formatCount} from "@/lib/utils/helpers/formatCount";
import {GroupedAvatar} from "@/components/groupedAvatar/groupedAvatar";
import {useMedia} from "@/context/MediaQueryContext";
import {CallActiveIndicator} from "@/components/callIndicator/CallActiveIndicator";
import { hueFor } from "@/lib/campHue";
import { HUE_CLASS } from "@/components/ui/graphics/hues";


const SideNavLink = memo(({ ch, link }: { ch: any, link: DesktopNavType }) => {
    const { isMobile } = useMedia();
    const isActive = ch.variant === "sidebarActive";
    const hasUnread = ch.unread_count && ch.unread_count > 0;
    const dispatch = useDispatch();
    // Channels, chats, docs and projects can open beside the page (split view).
    const pane = !isMobile ? paneFromHref(String(ch.path || "")) : null;
    // A channel, doc or team draws its glyph (the #, the page, the people) in
    // its own camp hue, so the sidebar shows what is what at a glance. The
    // strong cut at rest; the ink cut where the row is a step darker (hover,
    // the current place), which keeps the mark 3:1 on every ground in every
    // theme (paletteContrast). The label stays ink: identity is never text
    // colour. A destination (All docs, Home) has no hue_id and stays neutral.
    const glyph = ch.hue_id
        ? cn(HUE_CLASS[hueFor(ch.hue_id)], isActive ? "text-hue-ink" : "text-hue group-hover/nav:text-hue-ink")
        : isActive ? "text-foreground" : "text-muted-foreground";

    return (
        <div className="group/item relative">
        <Link
            href={`${ch.path}`}
            prefetch
            scroll={false}
            aria-current={isActive ? "page" : undefined}
            className={cn(
                "group/nav flex items-center gap-2 w-full h-7 px-2 rounded-md",
                "text-sm transition-colors duration-100",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                isActive ? "nav-active font-medium" : "nav-idle",
            )}
        >
            {ch.userProfile && <DesktopNavigationChatAvatar userInfo={ch.userProfile}/>}
            {ch.userParticipants && (
                <GroupedAvatar
                    users={ch.userParticipants}
                    max={2}
                    overlap={isMobile ? 12 : 8}
                    size={isMobile ? 24 : 20}
                    className={'!pr-0'}
                />
            )}
            {ch.icon && (
                <ch.icon
                    className={cn("shrink-0 h-4 w-4", glyph)}
                    strokeWidth={1.75}
                />
            )}
            {!ch.icon && !ch.userProfile && !ch.userParticipants && !ch.project_uuid && link.icon && (
                <link.icon
                    className={cn("shrink-0 h-4 w-4", glyph)}
                    strokeWidth={1.75}
                />
            )}
            {ch.project_uuid && (
                <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
                    <ColorIcon name={ch.project_uuid} size="dot" />
                </span>
            )}
            <span
                className={cn(
                    "truncate flex-1 min-w-0",
                    (ch.userParticipants || ch.userProfile) && "capitalize",
                    hasUnread && !isActive && "font-semibold text-foreground",
                )}
            >
                {ch.title}
            </span>
            {ch.isCallActive && (
                <CallActiveIndicator size="sm" pulse={false} className="shrink-0" />
            )}
            {ch.isFavorite && (
                <Star className="h-3 w-3 text-warning-ink fill-warning shrink-0" />
            )}
            {hasUnread ? (
                <Badge variant="sidebar" className="ml-auto pointer-events-none shrink-0">
                    {formatCount(ch.unread_count)}
                </Badge>
            ) : null}
            {ch.userProfile && <DesktopNavigationEmojiStatus userUUID={ch.userProfile.user_uuid}/>}
        </Link>
        {pane && (
            <button
                type="button"
                onClick={() => dispatch(openInSplit(pane))}
                aria-label={`Open ${ch.title} side by side`}
                title="Open side by side (Alt + click)"
                className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded bg-canvas text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 group-hover/item:opacity-100"
            >
                <Columns2 className="h-3.5 w-3.5" />
            </button>
        )}
        </div>
    )
})
SideNavLink.displayName = "SideNavLink"

/**
 * One entry in the icon rail.
 *
 * An entry that carries an action and no destination — focus mode's
 * "More" — renders as a button, not a link: it opens the sidebar rather
 * than navigating, and a link to "#" would jump the page to the top and
 * announce itself to assistive tech as somewhere to go.
 */
const CollapsedNavItem = memo(({ link }: { link: DesktopNavType }) => {
    const isAction = !!link.action && (!link.path || link.path === "#")

    const itemClass = cn(
        "flex items-center justify-center h-9 w-9 rounded-md transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
        link.variant === "sidebarActive" ? "nav-active" : "nav-idle",
    )

    const body = (
        <>
            {link?.icon && <link.icon className="h-4 w-4" strokeWidth={1.75} />}
            <span className="sr-only">{link.title}</span>
        </>
    )

    return (
        <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
                {isAction ? (
                    <button type="button" onClick={link.action} className={itemClass}>
                        {body}
                    </button>
                ) : (
                    <Link
                        href={`${link.path}`}
                        prefetch
                        scroll={false}
                        aria-current={link.variant === "sidebarActive" ? "page" : undefined}
                        className={itemClass}
                    >
                        {body}
                    </Link>
                )}
            </TooltipTrigger>
            <TooltipContent side="right" className="flex items-center gap-4">
                {link.title}
                {link.label && (
                    <Badge variant="sidebar" className="ml-auto">
                        {link.label}
                    </Badge>
                )}
            </TooltipContent>
        </Tooltip>
    )
})
CollapsedNavItem.displayName = "CollapsedNavItem"

export const DesktopSideNavigationBar = memo(({ links, isCollapsed }: {links:DesktopNavType[], isCollapsed: boolean}) => {


    return (
        <div
            data-collapsed={isCollapsed}
            className="group flex flex-col gap-1 py-2 data-[collapsed=true]:py-2"
        >
            {/* minmax(0,1fr): a grid column otherwise grows to its longest unbreakable
                name, and every row, unread badge and all, then runs past the panel. */}
            <nav className="grid grid-cols-[minmax(0,1fr)] gap-0.5 px-2 group-[[data-collapsed=true]]:justify-center group-[[data-collapsed=true]]:px-2">
                {links.map((link, index) =>
                        isCollapsed ? !link.children && (
                            <CollapsedNavItem key={index} link={link} />
                        ) : (
                            link.children ?
                                <div key={index} className="mt-1.5">
                                    <Collapsible
                                        open={link.isOpen}
                                        onOpenChange={link.setIsOpen}
                                        className="w-full"
                                    >
                                        {/* The label sits on the same left edge as the rows' icons,
                                            12px in muted text, with the chevron after it. The chevron
                                            shows on hover and focus, and stays while the group is
                                            closed so a closed group still says it opens. An empty
                                            group has nothing to open, so it never shows one. */}
                                        <div className="group/section flex items-center justify-between mb-0.5">
                                            <CollapsibleTrigger asChild>
                                                <button
                                                    className={cn(
                                                        "flex-1 flex items-center gap-1 h-6 px-2 rounded-md",
                                                        "text-2xs font-medium",
                                                        "text-muted-foreground hover:text-foreground",
                                                        "transition-colors duration-100 cursor-pointer text-left",
                                                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                                    )}
                                                    type="button"
                                                    aria-expanded={link.isOpen}
                                                >
                                                    {/* Sentence case: capitalize made "Direct Messages". */}
                                                    <span className={cn("truncate first-letter:uppercase", link.className)}>
                                                        {link.title}
                                                    </span>
                                                    {link.children.length > 0 && (
                                                        <ChevronRight
                                                            aria-hidden="true"
                                                            className={cn(
                                                                "shrink-0 h-3 w-3 transition-[transform,opacity] duration-150 ease-in-out",
                                                                link.isOpen
                                                                    ? "rotate-90 opacity-0 group-hover/section:opacity-100 group-focus-within/section:opacity-100"
                                                                    : "rotate-0",
                                                            )}
                                                            strokeWidth={2.25}
                                                        />
                                                    )}
                                                    {link.label && (
                                                        <Badge variant="sidebar" className="ml-1">
                                                            {link.label}
                                                        </Badge>
                                                    )}
                                                </button>
                                            </CollapsibleTrigger>
                                            {link.action ? (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 shrink-0 opacity-0 group-hover/section:opacity-100 focus-visible:opacity-100 transition-opacity"
                                                    onClick={link.action}
                                                    aria-label={`Add ${link.title}`}
                                                >
                                                    <Plus className='h-3.5 w-3.5'/>
                                                </Button>
                                            ) : <div className="h-6 w-6 shrink-0" />}
                                        </div>
                                        <CollapsibleContent className="space-y-px">
                                            {link.inlineCreator}
                                            {link.children.map((ch,chIn)=>{
                                                return <SideNavLink key={chIn} ch={ch} link={link} />
                                            })}

                                        </CollapsibleContent>
                                    </Collapsible>

                                </div>
                                :
                                <div key={index} className="group/nav flex items-center gap-0.5">
                                    <Link
                                        href={`${link.path}`}
                                        prefetch
                                        scroll={false}
                                        aria-current={link.variant === "sidebarActive" ? "page" : undefined}
                                        className={cn(
                                            "flex-1 flex items-center gap-2 h-7 px-2 rounded-md",
                                            "text-sm transition-colors duration-100",
                                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                                            link.variant === "sidebarActive" ? "nav-active font-medium" : "nav-idle",
                                        )}
                                    >
                                        {link.icon && (
                                            <link.icon
                                                className={cn(
                                                    "shrink-0 h-4 w-4",
                                                    link.variant === "sidebarActive"
                                                        ? "text-foreground"
                                                        : "text-muted-foreground",
                                                )}
                                                strokeWidth={1.75}
                                            />
                                        )}
                                        <span className={cn("truncate flex-1", link.className)}>{link.title}</span>
                                        {link.label && (
                                            <Badge variant="sidebar" className="ml-auto shrink-0">
                                                {link.label}
                                            </Badge>
                                        )}
                                    </Link>
                                    {link.action && (
                                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 opacity-0 group-hover/nav:opacity-100 focus-visible:opacity-100 transition-opacity" onClick={link.action} aria-label={`Add ${link.title}`}>
                                            <Plus className='h-3.5 w-3.5'/>
                                        </Button>
                                    )}
                                </div>
                        )
                )}
            </nav>
        </div>
    );
})

DesktopSideNavigationBar.displayName = "DesktopSideNavigationBar"
