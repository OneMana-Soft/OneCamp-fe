"use client"

import * as React from "react"
import { CircleUser, Forward, Link, MessageCircle, MessageSquareText, Pencil, Share2, Trash2, Type, Users } from "@/lib/icons";

import {
    Drawer,
    DrawerContent,
    DrawerDescription,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer"
import {preSelectedEmojis} from "@/components/drawers/consts/preSelectedEmojiConst";
import {Button} from "@/components/ui/button";
import Image from "next/image";
import addEmojiIconSrc from "@/assets/addEmoji.svg";
import {DrawerActionCard} from "@/components/drawerActionCard/drawerActionCard";
import {DrawerActionLink} from "@/components/drawerActionLink/drawerActionLink";
import {Separator} from "@/components/ui/separator";
import {DrawerDestructiveActionLink} from "@/components/drawerActionLink/drawerDestructiveActionLink";
import {openUI} from "@/store/slice/uiSlice";
import {useDispatch} from "react-redux";
import {useRouter} from "next/navigation";
import {app_chat_path, app_doc_path} from "@/types/paths";
import {useFetch} from "@/hooks/useFetch";
import type {DocInfoResponse} from "@/types/doc";
import {GetEndpointUrl} from "@/services/endPoints";


interface docOptionsDrawerProps {
    drawerOpenState: boolean;
    setOpenState: (state: boolean) => void;
    isOwner: boolean
    deleteMessage: () => void
    docId: string
}

export function DocOptionsDrawer({drawerOpenState, setOpenState, docId, isOwner, deleteMessage}: docOptionsDrawerProps) {

    const router = useRouter()
    const dispatch = useDispatch();
    const handleDeleteClick = () => {
        setTimeout(() => {
            deleteMessage()
        }, 100);

        closeDrawer()
    }

    const docInfo = useFetch<DocInfoResponse>(docId ? `${GetEndpointUrl.GetDocInfo}/${docId}` : '');



    function closeDrawer() {
        setOpenState(false);
    }

    const handleEditDocTitle = () => {
        dispatch(openUI({
            key: 'docUpdateTitle',
            data: {
                docId,
                title: docInfo.data?.data.doc_title || ''
            }
        }))
    }

    const handleCommentClick = () => {
        router.push(app_doc_path + '/'+ docId +'/'+"comments");
    }

    return (
        <Drawer  onOpenChange={closeDrawer} open={drawerOpenState}>
            <DrawerContent>
                <div className=" w-full mb-6">
                    <DrawerHeader className='hidden'>
                        <DrawerTitle></DrawerTitle>
                        <DrawerDescription></DrawerDescription>

                    </DrawerHeader>
                    <div className="flex-col p-4 pb-6 space-y-1">

                        <div className="flex flex-col items-center justify-start">

                            {isOwner && <DrawerActionLink
                                onLinkClick={handleEditDocTitle}
                                linkText={'Edit doc title'}
                                Icon={Pencil}
                            />}

                            <DrawerActionLink
                                onLinkClick={()=>{dispatch(openUI({ key: 'docShare', data: docId }))}}
                                linkText={'Share'}
                                Icon={Share2}
                            />

                            <DrawerActionLink
                                onLinkClick={handleCommentClick}
                                linkText={'Comments'}
                                Icon={MessageCircle}
                            />

                        </div>

                        { (isOwner ) &&
                            <>
                                <Separator orientation="horizontal" className='my-2'/>
                                <div className="flex flex-col items-center justify-start">
                                    <DrawerDestructiveActionLink
                                        onLinkClick={handleDeleteClick}
                                        linkText={'Delete doc'}
                                        Icon={Trash2}
                                    />
                                </div>
                            </>
                        }

                    </div>

                    {/*<DrawerFooter>*/}
                    {/*    <Button>Submit</Button>*/}
                    {/*    <DrawerClose asChild>*/}
                    {/*        <Button variant="outline">Cancel</Button>*/}
                    {/*    </DrawerClose>*/}
                    {/*</DrawerFooter>*/}
                </div>
            </DrawerContent>
        </Drawer>
    )
}
