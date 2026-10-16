import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {DocInfoResponse} from "@/types/doc";
import {GetEndpointUrl} from "@/services/endPoints";
import {Button} from "@/components/ui/button";
import {openUI} from "@/store/slice/uiSlice";
import { MessageCircle } from "@/lib/icons";
import { Ellipsis } from "@/lib/icons";
import {useEffect, useState} from "react";
import {useDispatch, useSelector} from "react-redux";
import type {RootState} from "@/store/store";
import Link from "next/link";
import { app_doc_path} from "@/types/paths";
import {UserProfileInterface} from "@/types/user";

export function MobileTopNavigationBarThirdDoc({docId}:{docId: string}) {

    const dispatch = useDispatch();
    const docCommentCount = useSelector((state: RootState) => state.createDocComment?.docCommentCount[docId]);
    // The page says why a doc didn't open (no access, the trash); the bar stays quiet.
    const docInfo = useFetch<DocInfoResponse>(docId ? `${GetEndpointUrl.GetDocInfo}/${docId}` : '', undefined, undefined, { suppressErrorToast: true } as never);
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    const [isOwner, setIsOwner] = useState(false)

    const commentHref = `${app_doc_path}/${docId}/comment`;

    useEffect(() => {

        // Both known, and the same person: undefined == undefined made
        // everyone the owner while either was loading.
        const owner = docInfo.data?.data?.doc_created_by?.user_uuid
        const me = selfProfile.data?.data?.user_uuid
        setIsOwner(!!owner && !!me && owner === me)

    }, [docInfo.data, selfProfile.data])

    // Delete is B6's doc.trash on the sheet: to the trash, with Undo.
    const deleteDoc = () => {}


    return (
        <div className='flex justify-end space-x-1'>
            {/*<DocCommentPopover/>*/}
            {/* 44px, matching the other mobile top-bar actions: a thumb reaching
                the top of a phone one-handed is at its least accurate. */}
            <Button variant='ghost' className="h-11 min-w-11" asChild><Link href={commentHref} aria-label="Comments"><MessageCircle className='h-5'/>{docCommentCount || ''}</Link></Button>

            <Button variant='ghost' size='icon' className="h-11 w-11" aria-label="Document options" onClick={() => dispatch(openUI({ key: 'docOptionsDrawer', data: { docId: docId, isOwner: isOwner, deleteDoc: deleteDoc } }))}><Ellipsis className='h-5'/></Button>

        </div>

    );
}