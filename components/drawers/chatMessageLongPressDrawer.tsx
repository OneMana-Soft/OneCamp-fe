"use client"

import * as React from "react"
import { Bell, Bookmark, CircleUser, Forward, Languages, Link, Loader2, MessageSquareText, Pencil, Reply, Trash2, Type, Users } from "@/lib/icons";
import { useTranslateText } from "@/services/aiService";

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
import {app_channel_path, app_chat_path, app_home_path, app_message_forward_path} from "@/types/paths";
import {useRouter} from "next/navigation";
import {chat_forward_type} from "@/types/user";
import {useCopyToClipboard} from "@/hooks/useCopyToClipboard";

interface chatOptionsDrawerProps {
    drawerOpenState: boolean
    setOpenState: (state: boolean) => void
    onAddEmoji: () => void
    otherUserUUID: string
    chatUUID: string
    editMessage: () => void
    deleteMessage: () => void
    copyTextToClipboard: () => void
    handleEmojiClick: (emojiId: string) => void
    // onReply arms the composer for a Discord-style inline reply (distinct from
    // "Thread", which opens the message's thread view).
    onReply?: () => void
    isOwner?: boolean
    isAdmin?: boolean
    messageText?: string
}



export function ChatMessageLongPressDrawer({ drawerOpenState, setOpenState, onAddEmoji, copyTextToClipboard,  otherUserUUID, chatUUID, editMessage, deleteMessage, isAdmin, isOwner, handleEmojiClick, onReply, messageText }: chatOptionsDrawerProps) {

    const router = useRouter();
    const copyToClipboard = useCopyToClipboard()

    const { translateText, isSubmitting: translating } = useTranslateText()
    const [translation, setTranslation] = React.useState<string | null>(null)
    const handleTranslate = async () => {
        const t = (messageText || "").trim()
        if (!t) return
        const target = typeof navigator !== "undefined" ? navigator.language : "English"
        const res = await translateText(t, target)
        if (res?.translation) setTranslation(res.translation)
    }


    function closeDrawer() {

        // setTimeout(() => {
        //     setOpenState(false)
        // }, 500);

        setOpenState(false)


    }

    // Handlers for card clicks
    const handleThreadClick = () => {

        router.push(`${app_chat_path}/${otherUserUUID}/${chatUUID}`);
        closeDrawer()

    }

    const handleInlineReplyClick = () => {
        onReply?.()
        closeDrawer()
    }


    const handleCopyLink = () => {
        const host = window.location.host;
        const protocol = window.location.protocol;
        const baseUrl = `${protocol}//${host}`;
        const newPath = `${app_channel_path}/${otherUserUUID}/${chatUUID}`

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
        setTimeout(() => {
            deleteMessage()
        }, 100);

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

                        {/* Cards Section */}
                        <div className="flex justify-center gap-4">

                            {onReply && (
                                <DrawerActionCard
                                    onCardClick={handleInlineReplyClick}
                                    Icon={Reply}
                                    cardText={'Reply'}
                                />
                            )}

                            <DrawerActionCard
                                onCardClick={handleThreadClick}
                                Icon={MessageSquareText}
                                cardText={'Thread'}
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

                            {!!(messageText || "").trim() && (
                                <DrawerActionLink
                                    onLinkClick={handleTranslate}
                                    linkText={translating ? 'Translating…' : (translation ? 'Re-translate' : 'Translate')}
                                    Icon={translating ? Loader2 : Languages}
                                />
                            )}

                        </div>

                        {translation && (
                            <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
                                <div className="mb-0.5 flex items-center gap-1.5 text-2xs font-medium text-primary">
                                    <Languages className="h-3 w-3" />
                                    Translated
                                </div>
                                <p className="whitespace-pre-line text-sm text-foreground">{translation}</p>
                            </div>
                        )}

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