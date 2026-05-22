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
import {app_home_path, app_message_forward_path} from "@/types/paths";
import {useRouter} from "next/navigation";

interface docCommentOptionsDrawerProps {
    drawerOpenState: boolean
    setOpenState: (state: boolean) => void
    onAddEmoji: () => void
    editMessage: () => void
    deleteMessage: () => void
    copyTextToClipboard: () => void
    handleEmojiClick: (emojiId: string) => void
    isOwner?: boolean
}



export function DocCommentMessageLongPressDrawer({ drawerOpenState, deleteMessage, setOpenState, onAddEmoji, copyTextToClipboard, editMessage, handleEmojiClick, isOwner }: docCommentOptionsDrawerProps) {


    function closeDrawer() {
        setOpenState(false)
    }

    const handleEditClick = () => {
        editMessage()
        closeDrawer()
    }


    const handleDeleteClick = () => {
        setTimeout(() => {
            deleteMessage()
        }, 100);

        closeDrawer()
    }

    const emojiClick = (emojiId: string) => {
        handleEmojiClick(emojiId)
        closeDrawer()
    }

    const handleCopyClick = () => {
        copyTextToClipboard()
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
                                            <span className="text-2xl">{e.emojiString}</span>
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

                        <div className="flex flex-col items-center justify-start pt-2 space-y-1">

                            <DrawerActionLink
                                onLinkClick={handleCopyClick}
                                linkText={'Copy all text'}
                                Icon={Type}
                            />


                            <DrawerActionLink
                                onLinkClick={handleEditClick}
                                linkText={'Edit message'}
                                Icon={Pencil}
                            />

                        </div>

                        {( isOwner)  && <>
                            <Separator orientation="horizontal" className='my-2'/>

                            <div className="flex flex-col items-center justify-start">

                                <DrawerDestructiveActionLink
                                    onLinkClick={handleDeleteClick}
                                    linkText={'Delete message'}
                                    Icon={Trash2}
                                />

                            </div></>}


                    </div>


                </div>
            </DrawerContent>
        </Drawer>
    )
}