"use client";

import { ChevronRight, Plus} from "lucide-react";

import { cn } from "@/lib/utils/helpers/cn";
import {Button, buttonVariants} from "@/components/ui/button";
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
    
    return (
        <Link
            href={`${ch.path}`}
            className={cn("hover:cursor-pointer w-full",
                buttonVariants({ variant: ch.variant, size: "sm" }),
                "justify-start space-x-2 md:space-x-1"
            )}
        >
            {ch.userProfile && <DesktopNavigationChatAvatar userInfo={ch.userProfile}/> }
            {ch.userParticipants && <GroupedAvatar users={ch.userParticipants} max={2} overlap={isMobile ? 12 : 8} size={isMobile ? 28 : 20} className={'!pr-0'}/>}
            {!ch.userProfile && !ch.userParticipants && !ch.project_uuid && link.icon && <link.icon className=" md:h-4 md:w-5 h-6 w-5" />}
            {ch.project_uuid && <ColorIcon name={ch.project_uuid} size={'xs'}/>}
            <div className={cn(` overflow-ellipsis truncate md:text-sm font-normal text-lg ${ch.unread_count ? 'font-semibold':''}`, ch.userParticipants || ch.userProfile ? 'capitalize' :'')}>{ch.title}</div>
            {ch.isCallActive && <CallActiveIndicator size="sm" pulse={false} className="ml-1 shrink-0" />}
            {ch.unread_count && ch.unread_count > 0 ? (
                <Badge variant="sidebar" className="ml-auto pointer-events-none">
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
            className="group flex flex-col gap-4 py-2 data-[collapsed=true]:py-2 "
        >
            <nav className="grid gap-1 px-2 group-[[data-collapsed=true]]:justify-center group-[[data-collapsed=true]]:px-2">
                {links.map((link, index) =>
                        isCollapsed ? !link.children && (
                            <Tooltip key={index} delayDuration={0}>
                                <TooltipTrigger asChild>
                                    <Link
                                        href={`${link.path}`}
                                        className={cn("hover:cursor-pointer",
                                            buttonVariants({ variant: link.variant, size: "icon" }),
                                            "h-10 w-10",

                                        )}
                                    >
                                        {link?.icon && <link.icon className="h-4 w-4" />}
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
                                <div key={index} className='mt-3 md:mt-1'>
                                    <Collapsible
                                        open={link.isOpen}
                                        onOpenChange={link.setIsOpen}
                                        className="w-full "
                                    >
                                        <div className="flex items-center justify-between space-x-4  mb-2 md:mb-1">
                                            <div className="flex justify-center items-center ">
                                                <CollapsibleTrigger asChild>
                                                    <div
                                                        className='flex hover:cursor-pointer space-x-4 justify-center items-center '
                                                    >

                                                            <ChevronRight
                                                                          className={cn(
                                                                              "h-6 w-6 md:h-4 md:w-4 transition-all duration-200 ease-in-out transform", // Base transition and transform
                                                                              link.isOpen ? "rotate-90" : "rotate-0" ,// Conditional rotation
                                                                              "transition-all duration-200 ease-in-out transform"
                                                                          )}
                                                            />

                                                        <div className='flex justify-center items-center'>
                                                            {link.icon && <link.icon className="mr-2 md:h-4 md:w-5 h-6 w-5" />}
                                                            <span className={cn("text-md md:text-sm capitalize", link.label ? "font-bold" : "", link.className)}>
                                                                {link.title}
                                                            </span>
                                                        </div>



                                                    </div>
                                                </CollapsibleTrigger>

                                            </div>
                                            <div className="w-9 h-9 flex items-center justify-center">
                                                {link.action ? (
                                                    <Button variant="ghost" size="icon" onClick={link.action}>
                                                        <Plus className='size-2'/>
                                                    </Button>
                                                ) : null}
                                            </div>

                                        </div>
                                        <CollapsibleContent className="space-y-2">
                                            {link.children.map((ch,chIn)=>{
                                                return <SideNavLink key={chIn} ch={ch} link={link} />
                                            })}

                                        </CollapsibleContent>
                                    </Collapsible>

                                </div>
                                :
                                <Link
                                    key={index}
                                    href={`${link.path}`}
                                    className={cn("hover:cursor-pointer",
                                        buttonVariants({ variant: link.variant, size: "sm" }),
                                        "justify-start"
                                    )}
                                >
                                    {link.icon && <link.icon className="mr-2 h-4 w-4" />}
                                    <span className={cn(link.label ? "font-bold" : "", link.className)}>{link.title}</span>
                                    {link.label && (
                                        <Badge variant="sidebar" className="ml-auto">
                                            {link.label}
                                        </Badge>
                                    )}
                                </Link>
                        )
                )}
            </nav>
        </div>
    );
})

DesktopSideNavigationBar.displayName = "DesktopSideNavigationBar"
