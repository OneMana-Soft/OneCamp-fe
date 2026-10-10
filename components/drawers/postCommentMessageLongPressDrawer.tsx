"use client"

import { Pencil, Trash2, Type, SmilePlus } from "@/lib/icons";

import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import {Separator} from "@/components/ui/separator";
import {preSelectedEmojis} from "@/components/drawers/consts/preSelectedEmojiConst";
import {DrawerActionLink} from "@/components/drawerActionLink/drawerActionLink";
import {DrawerDestructiveActionLink} from "@/components/drawerActionLink/drawerDestructiveActionLink";

interface postCommentOptionsDrawerProps {
    drawerOpenState: boolean
    setOpenState: (state: boolean) => void
    onAddEmoji: () => void
    copyTextToClipboard: () => void
    editMessage: () => void
    deleteMessage: () => void
    handleEmojiClick: (emojiId: string) => void
    isAdmin?: boolean
    isOwner?: boolean
}



export function PostCommentMessageLongPressDrawer({ drawerOpenState, isAdmin, isOwner, setOpenState, onAddEmoji, copyTextToClipboard, editMessage, deleteMessage, handleEmojiClick }: postCommentOptionsDrawerProps) {


    function closeDrawer() {
        setOpenState(false)
    }

    const handleEditClick = () => {
        editMessage()
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

    const handleDeleteClick = () => {
        setTimeout(() => {
            deleteMessage()
        }, 100);

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

                                        <Button variant="ghost" size="icon" className="rounded-full h-12 w-12 hover:bg-muted/50 transition-colors" key={e.emojiId} aria-label={`React with ${e.emojiName}`} onClick={()=>{emojiClick(e.emojiId)}}>
                                            <span className="text-2xl"><span className="text-2xl">{e.emojiString}</span></span>
                                        </Button>
                                    )
                                })
                            }


                            <Button
                                variant="ghost"
                                size="icon"
                                className="rounded-full h-12 w-12 hover:bg-muted/50 transition-colors"
                                aria-label="Pick another reaction"
                                onClick={() => onAddEmoji()}
                            >
                                <SmilePlus aria-hidden="true" className="h-[22px] w-[22px] text-muted-foreground" strokeWidth={1.75} />
                            </Button>
                        </div>


                        <div className="flex flex-col items-center justify-start  pt-2">


                            <DrawerActionLink
                                onLinkClick={handleCopyClick}
                                linkText={'Copy all text'}
                                Icon={Type}
                            />


                            {isOwner && <DrawerActionLink
                                onLinkClick={handleEditClick}
                                linkText={'Edit message'}
                                Icon={Pencil}
                            />}

                        </div>

                        {(isAdmin || isOwner)  && <><Separator orientation="horizontal" className='absolute w-full left-0'/>

                         <div className="flex flex-col items-center justify-start  pt-2">

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