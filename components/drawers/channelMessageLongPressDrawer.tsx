"use client"

import * as React from "react"
import { Bell, Bookmark, CircleUser, Forward, Link, MessageSquareText, Pencil, Trash2, Type, Users } from "@/lib/icons";

import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"

import { Button } from "@/components/ui/button"
import Image from "next/image"
import addEmojiIconSrc from "@/assets/addEmoji.svg"
import {Separator} from "@/components/ui/separator";
import {preSelectedEmojis} from "@/components/drawers/consts/preSelectedEmojiConst";
import {DrawerActionCard} from "@/components/drawerActionCard/drawerActionCard";
import {DrawerActionLink} from "@/components/drawerActionLink/drawerActionLink";
import {DrawerDestructiveActionLink} from "@/components/drawerActionLink/drawerDestructiveActionLink";
import {app_channel_path, app_home_path, app_message_forward_path} from "@/types/paths";
import {useRouter} from "next/navigation";
import {useCopyToClipboard} from "@/hooks/useCopyToClipboard";

interface channelOptionsDrawerProps {
    drawerOpenState: boolean
    setOpenState: (state: boolean) => void
    onAddEmoji: () => void
    postUUID: string
    channelUUID: string
    copyTextToClipboard: () => void
    editMessage: () => void
    deleteMessage: () => void
    handleEmojiClick: (emojiId: string) => void
    isOwner: boolean
    isAdmin?: boolean
}



export function ChannelMessageLongPressDrawer({ drawerOpenState, copyTextToClipboard, setOpenState, onAddEmoji, postUUID, channelUUID, editMessage, deleteMessage, isAdmin, isOwner, handleEmojiClick }: channelOptionsDrawerProps) {

    const router = useRouter();

    const copyToClipboard = useCopyToClipboard()

    function closeDrawer() {

        // setTimeout(() => {
        //     setOpenState(false)
        // }, 500);

        setOpenState(false)


    }

    // Handlers for card clicks
    const handleReplyClick = () => {

        router.push(`${app_channel_path}/${channelUUID}/${postUUID}`);
        closeDrawer()
    }

    const handleCopyLink = () => {
        const host = window.location.host;
        const protocol = window.location.protocol;
        const baseUrl = `${protocol}//${host}`;
        const newPath = `${app_channel_path}/${channelUUID}/${postUUID}`

        copyToClipboard.copy(`${baseUrl}${newPath}`, 'copied link')

        closeDrawer()
    }

    const handleForwardClick = () => {
        router.push(`${app_message_forward_path}/${channelUUID}/${postUUID}`);
        closeDrawer()
    }


    const handleDeleteClick = () => {
        setTimeout(() => {
            deleteMessage()
        }, 100);

        closeDrawer()
    }

    const handleEditClick = () => {
        editMessage()
        closeDrawer()
    }

    const handleCopyClick = () => {
        copyTextToClipboard()
        closeDrawer()
    }

    const emojiClick = (emojiId: string) => {
        handleEmojiClick(emojiId)
        closeDrawer()
    }


    return (
        <Drawer onOpenChange={closeDrawer} open={drawerOpenState}>
            <DrawerContent>
                <div className="w-full mb-6 relative">
                    <DrawerHeader className="hidden">
                        <DrawerTitle></DrawerTitle>
                        <DrawerDescription></DrawerDescription>
                    </DrawerHeader>

                    <div className="flex-col p-4 pb-6 space-y-4">
                        {/* Emoji Buttons */}
                        <div className="flex justify-between items-center bg-muted/20 p-2 rounded-2xl">

                            {
                                preSelectedEmojis.map(( e) => {
                                    return (

                                        <Button variant="ghost" size="icon" className="rounded-full h-12 w-12 hover:bg-muted/50 transition-colors" key={e.emojiId} onClick={()=>{emojiClick(e.emojiId)}}>
                                            <span className="text-2xl"><span className="text-2xl">{e.emojiString}</span></span>
                                        </Button>
                                    )
                                })
                            }


                            <Button variant="ghost" size="icon" className="rounded-full h-12 w-12 hover:bg-muted/50 transition-colors">
                                <Image
                                    src={addEmojiIconSrc || "/placeholder.svg?height=28&width=28"}
                                    alt="Add Emoji"
                                    width={22}
                                    height={22}
                                    className="hover:cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
                                    onClick={() => {
                                        onAddEmoji()
                                    }}
                                />
                            </Button>
                        </div>

                        {/* Cards Section */}
                        <div className="flex justify-center gap-4">

                            <DrawerActionCard
                                onCardClick={handleReplyClick}
                                Icon={MessageSquareText}
                                cardText={'Reply'}
                            />

                            <DrawerActionCard
                                onCardClick={handleForwardClick}
                                Icon={Forward}
                                cardText={'Forward'}
                            />


                        </div>

                        <div className="flex flex-col items-center justify-start pt-2 space-y-1">

                            {isOwner && <DrawerActionLink
                                onLinkClick={handleEditClick}
                                linkText={'Edit message'}
                                Icon={Pencil}
                            />}


                            <DrawerActionLink
                                onLinkClick={handleCopyLink}
                                linkText={'Copy link to message'}
                                Icon={Link}
                            />

                            <DrawerActionLink
                                onLinkClick={handleCopyClick}
                                linkText={'Copy all text'}
                                Icon={Type}
                            />



                        </div>

                        { (isOwner || isAdmin) &&
                            <>
                                <Separator orientation="horizontal" className='my-2'/>
                                <div className="flex flex-col items-center justify-start">
                                    <DrawerDestructiveActionLink
                                        onLinkClick={handleDeleteClick}
                                        linkText={'Delete message'}
                                        Icon={Trash2}
                                    />
                                </div>
                            </>
                        }


                    </div>


                </div>
            </DrawerContent>
        </Drawer>
    )
}