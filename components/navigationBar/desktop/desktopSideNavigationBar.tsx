"use client";

import { ChevronRight, Plus, Star } from "@/lib/icons";

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
import React, { memo } from "react";
import {ColorIcon} from "@/components/colorIcon/colorIcon";
import {formatCount} from "@/lib/utils/helpers/formatCount";
import {GroupedAvatar} from "@/components/groupedAvatar/groupedAvatar";
import {useMedia} from "@/context/MediaQueryContext";
import {CallActiveIndicator} from "@/components/callIndicator/CallActiveIndicator";


const SideNavLink = memo(({ ch, link }: { ch: any, link: DesktopNavType }) => {
    const { isMobile } = useMedia();
    const isActive = ch.variant === "sidebarActive";
    const hasUnread = ch.unread_count && ch.unread_count > 0;

    return (
        <Link
            href={`${ch.path}`}
            scroll={false}
            aria-current={isActive ? "page" : undefined}
            className={cn(
                "group/nav flex items-center gap-2 w-full h-7 px-2 rounded-md",
                "text-sm transition-colors duration-100",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                isActive
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-foreground/80 hover:bg-accent/60 hover:text-foreground",
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
                    className={cn(
                        "shrink-0 h-4 w-4",
                        isActive ? "text-foreground" : "text-muted-foreground",
                    )}
                    strokeWidth={1.75}
                />
            )}
            {!ch.icon && !ch.userProfile && !ch.userParticipants && !ch.project_uuid && link.icon && (
                <link.icon
                    className={cn(
                        "shrink-0 h-4 w-4",
                        isActive ? "text-foreground" : "text-muted-foreground",
                    )}
                    strokeWidth={1.75}
                />
            )}
            {ch.project_uuid && <ColorIcon name={ch.project_uuid} size={'xs'}/>}
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
                <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />
            )}
            {hasUnread ? (
                <Badge variant="sidebar" className="ml-auto pointer-events-none shrink-0">
                    {formatCount(ch.unread_count)}
                </Badge>
            ) : null}
            {ch.userProfile && <DesktopNavigationEmojiStatus userUUID={ch.userProfile.user_uuid}/>}
        </Link>
    )
})
SideNavLink.displayName = "SideNavLink"

export const DesktopSideNavigationBar = memo(({ links, isCollapsed }: {links:DesktopNavType[], isCollapsed: boolean}) => {


    return (
        <div
            data-collapsed={isCollapsed}
            className="group flex flex-col gap-1 py-2 data-[collapsed=true]:py-2"
        >
            <nav className="grid gap-0.5 px-2 group-[[data-collapsed=true]]:justify-center group-[[data-collapsed=true]]:px-2">
                {links.map((link, index) =>
                        isCollapsed ? !link.children && (
                            <Tooltip key={index} delayDuration={0}>
                                <TooltipTrigger asChild>
                                    <Link
                                        href={`${link.path}`}
                                        scroll={false}
                                        aria-current={link.variant === "sidebarActive" ? "page" : undefined}
                                        className={cn(
                                            "flex items-center justify-center h-9 w-9 rounded-md transition-colors",
                                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                                            link.variant === "sidebarActive"
                                                ? "bg-accent text-accent-foreground"
                                                : "text-foreground/80 hover:bg-accent/60 hover:text-foreground",
                                        )}
                                    >
                                        {link?.icon && <link.icon className="h-4 w-4" strokeWidth={1.75} />}
                                        <span className="sr-only">{link.title}</span>
                                    </Link>
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
                        ) : (
                            link.children ?
                                <div key={index} className="mt-1.5">
                                    <Collapsible
                                        open={link.isOpen}
                                        onOpenChange={link.setIsOpen}
                                        className="w-full"
                                    >
                                        <div className="group/section flex items-center justify-between mb-0.5">
                                            <CollapsibleTrigger asChild>
                                                <button
                                                    className={cn(
                                                        "flex-1 flex items-center gap-1.5 h-6 px-1.5 rounded-md",
                                                        "text-[11px] font-semibold uppercase tracking-wide",
                                                        "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                                                        "transition-colors duration-100 cursor-pointer text-left",
                                                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                                                    )}
                                                    type="button"
                                                    aria-expanded={link.isOpen}
                                                >
                                                    <ChevronRight
                                                        className={cn(
                                                            "shrink-0 h-3 w-3 transition-transform duration-150 ease-in-out",
                                                            link.isOpen ? "rotate-90" : "rotate-0",
                                                        )}
                                                        strokeWidth={2.25}
                                                    />
                                                    <span className={cn("truncate", link.className)}>
                                                        {link.title}
                                                    </span>
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
                                        scroll={false}
                                        aria-current={link.variant === "sidebarActive" ? "page" : undefined}
                                        className={cn(
                                            "flex-1 flex items-center gap-2 h-7 px-2 rounded-md",
                                            "text-sm transition-colors duration-100",
                                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                                            link.variant === "sidebarActive"
                                                ? "bg-accent text-accent-foreground font-medium"
                                                : "text-foreground/80 hover:bg-accent/60 hover:text-foreground",
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
