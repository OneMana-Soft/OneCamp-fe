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
import { useParams } from "next/navigation";
import { isPhoneModerator } from "@/components/docComments/phoneModeration";

interface docCommentOptionsDrawerProps {
    drawerOpenState: boolean
    setOpenState: (state: boolean) => void
    onAddEmoji: () => void
    editMessage: () => void
    deleteMessage: () => void
    copyTextToClipboard: () => void
    handleEmojiClick: (emojiId: string) => void
    /** The comment is theirs. */
    isOwner?: boolean
}

/**
 * A doc comment's long-press sheet on a phone (docs programme B7): react,
 * copy, and for its author edit; delete for its author, and for whoever may
 * remove anyone's comment on the doc (its owner, full access, an admin: N45).
 * Edit showed for everyone, and failed for all but the author.
 */
export function DocCommentMessageLongPressDrawer({ drawerOpenState, deleteMessage, setOpenState, onAddEmoji, copyTextToClipboard, editMessage, handleEmojiClick, isOwner }: docCommentOptionsDrawerProps) {
    // The doc in the address: the thread page it was opened from.
    const params = useParams<{ "doc-id"?: string }>()
    const canDelete = !!isOwner || isPhoneModerator(params?.["doc-id"])

    function closeDrawer() {
        setOpenState(false)
    }

    const handleEditClick = () => {
        editMessage()
        closeDrawer()
    }

    // After the sheet has closed, so the question that follows takes focus.
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
        <Drawer detent="medium" onOpenChange={closeDrawer} open={drawerOpenState}>
            <DrawerContent>
                <div className="w-full mb-6 relative">
                    <DrawerHeader className="hidden">
                        <DrawerTitle>Comment</DrawerTitle>
                        <DrawerDescription>React to the comment, copy it, or change it.</DrawerDescription>
                    </DrawerHeader>

                    <div className="flex-col p-4 pb-6 space-y-4">
                        {/* Emoji Buttons */}
                        <div className="flex justify-between items-center bg-muted/20 p-2 rounded-2xl">

                            {
                                preSelectedEmojis.map(( e) => {
                                    return (

                                        <Button variant="ghost" size="icon" className="rounded-full h-12 w-12 transition-colors" key={e.emojiId} aria-label={`React with ${e.emojiName}`} onClick={()=>{emojiClick(e.emojiId)}}>
                                            <span className="text-2xl">{e.emojiString}</span>
                                        </Button>
                                    )
                                })
                            }


                            <Button
                                variant="ghost"
                                size="icon"
                                className="rounded-full h-12 w-12 transition-colors"
                                aria-label="Pick another reaction"
                                onClick={() => onAddEmoji()}
                            >
                                <SmilePlus aria-hidden="true" className="h-[22px] w-[22px] text-muted-foreground" />
                            </Button>
                        </div>

                        <div className="flex flex-col items-center justify-start pt-2 space-y-1">

                            <DrawerActionLink
                                onLinkClick={handleCopyClick}
                                linkText={'Copy text'}
                                Icon={Type}
                            />

                            {isOwner && (
                                <DrawerActionLink
                                    onLinkClick={handleEditClick}
                                    linkText={'Edit comment'}
                                    Icon={Pencil}
                                />
                            )}

                        </div>

                        {canDelete && <>
                            <Separator orientation="horizontal" className='my-2'/>

                            <div className="flex flex-col items-center justify-start">

                                <DrawerDestructiveActionLink
                                    onLinkClick={handleDeleteClick}
                                    linkText={'Delete comment'}
                                    Icon={Trash2}
                                />

                            </div></>}


                    </div>


                </div>
            </DrawerContent>
        </Drawer>
    )
}
