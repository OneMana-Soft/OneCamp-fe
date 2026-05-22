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
import { useDispatch } from "react-redux"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import addEmojiIconSrc from "@/assets/addEmoji.svg"
import { Card, CardContent } from "@/components/ui/card"
import {Separator} from "@/components/ui/separator";
import {preSelectedEmojis} from "@/components/drawers/consts/preSelectedEmojiConst";
import {DrawerActionCard} from "@/components/drawerActionCard/drawerActionCard";
import {DrawerActionLink} from "@/components/drawerActionLink/drawerActionLink";
import {DrawerDestructiveActionLink} from "@/components/drawerActionLink/drawerDestructiveActionLink";
import {
    app_channel_path,
    app_chat_path,
    app_grp_chat_path,
    app_home_path,
    app_message_forward_path
} from "@/types/paths";
import {useRouter} from "next/navigation";
import {chat_forward_type} from "@/types/user";
import {useCopyToClipboard} from "@/hooks/useCopyToClipboard";

interface dmChatOptionsDrawerProps {
    drawerOpenState: boolean
    setOpenState: (state: boolean) => void
    onAddEmoji: () => void
    grpId: string
    chatUUID: string
    editMessage: () => void
    deleteMessage: () => void
    copyTextToClipboard: () => void
    handleEmojiClick: (emojiId: string) => void
    isOwner?: boolean
    isAdmin?: boolean
}



export function DmGroupChatMessageLongPressDrawer({ drawerOpenState, handleEmojiClick, editMessage, deleteMessage, copyTextToClipboard, setOpenState, onAddEmoji, chatUUID, grpId, isAdmin, isOwner }: dmChatOptionsDrawerProps) {

    const router = useRouter();
    const copyToClipboard = useCopyToClipboard()


    function closeDrawer() {

        // setTimeout(() => {
        //     setOpenState(false)
        // }, 500);

        setOpenState(false)


    }


    const handleCopyLink = () => {
        const host = window.location.host;
        const protocol = window.location.protocol;
        const baseUrl = `${protocol}//${host}`;
        const newPath = `${app_grp_chat_path}/${grpId}/${chatUUID}`

        copyToClipboard.copy(`${baseUrl}${newPath}`, 'copied link')

        closeDrawer()
    }

    const handleCopyClick = () => {
        copyTextToClipboard()
        closeDrawer()
    }

    const handleForwardClick = () => {
        router.push(`${app_message_forward_path}/${chat_forward_type}/${chatUUID}`);
        closeDrawer()
    }

    const handleDeleteClick = () => {
        deleteMessage()
        closeDrawer()
    }

    const handleEditClick = () => {
        editMessage()
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

                    <div className="flex-col p-4 pb-2 space-y-4">
                        {/* Emoji Buttons */}
                        <div className="flex justify-between items-center bg-muted/20 p-2 rounded-2xl">

                            {
                                preSelectedEmojis.map(( e) => {
                                    return (

                                        <Button variant="ghost" size="icon" className="rounded-full h-12 w-12 hover:bg-muted/50 transition-colors" key={e.emojiId} onClick={()=>{emojiClick(e.emojiId)}}>
                                            <span className="text-2xl">{e.emojiString}</span>
                                        </Button>
                                    )
                                })
                            }


                            <Button variant="ghost" size="icon" className="rounded-full h-12 w-12 hover:bg-muted/50 transition-colors">
                                <Image
                                    src={addEmojiIconSrc || "/placeholder.svg?height=24&width=24"}
                                    alt="Add Emoji"
                                    width={18}
                                    height={18}
                                    className="hover:cursor-pointer opacity-70 hover:opacity-100 transition-opacity"
                                    onClick={() => {
                                        onAddEmoji()
                                    }}
                                />
                            </Button>
                        </div>

                        {/* Cards Section */}
                        <div className="flex flex-wrap gap-2">


                            <DrawerActionCard
                                onCardClick={handleForwardClick}
                                Icon={Forward}
                                cardText={'Forward'}
                            />

                        </div>

                        <div className="flex flex-col items-center justify-start  pt-2">

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
                            <><Separator orientation="horizontal" className='absolute w-full left-0'/>

                                <div className="flex flex-col items-center justify-start  pt-2">

                                    <DrawerDestructiveActionLink
                                        onLinkClick={handleDeleteClick}
                                        linkText={'Delete message'}
                                        Icon={Trash2}
                                    />

                                </div></>
                        }


                    </div>


                </div>
            </DrawerContent>
        </Drawer>
    )
}