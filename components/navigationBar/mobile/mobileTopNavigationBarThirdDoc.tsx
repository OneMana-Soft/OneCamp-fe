import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {CreateDocCommentInterface, DocInfoResponse} from "@/types/doc";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {Button} from "@/components/ui/button";
import {openUI} from "@/store/slice/uiSlice";
import {Ellipsis, MessageCircle} from "lucide-react";
import React, {useCallback, useEffect, useState} from "react";
import {useDispatch, useSelector} from "react-redux";
import type {RootState} from "@/store/store";
import {useRouter} from "next/navigation";
import Link from "next/link";
import { app_doc_path} from "@/types/paths";
import {usePost} from "@/hooks/usePost";
import {UserProfileInterface} from "@/types/user";

export function MobileTopNavigationBarThirdDoc({docId}:{docId: string}) {

    const dispatch = useDispatch();
    const docCommentCount = useSelector((state: RootState) => state.createDocComment.docCommentCount[docId]);
    const router = useRouter();
    const docInfo = useFetch<DocInfoResponse>(docId ? `${GetEndpointUrl.GetDocInfo}/${docId}` : '');
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    const [isOwner, setIsOwner] = useState(false)

    const post = usePost()

    const commentHref = `${app_doc_path}/${docId}/comment`;

    useEffect(() => {

        if(docInfo && docInfo.data?.data.doc_created_by.user_uuid == selfProfile.data?.data.user_uuid) {
            setIsOwner(true)
        }

    }, [docInfo])

    const executeDeleteDoc = () => {

        post.makeRequest<CreateDocCommentInterface>({
            apiEndpoint:PostEndpointUrl.DeleteDoc,
            payload: {
                doc_uuid: docId
            }
        }).then(() => {
            router.push(app_doc_path);
        })
    }

    const deleteDoc = () => {
        setTimeout(() => {
            dispatch(openUI({
                key: 'confirmAlert',
                data: {
                    title: "Deleting Doc",
                    description: "Are you sure you want to proceed deleting the doc",
                    confirmText: "Delete chat",
                    onConfirm: ()=>{executeDeleteDoc()}
                }
            }));
        }, 500);
    }


    return (
        <div className='flex justify-end space-x-1'>
            {/*<DocCommentPopover/>*/}
            <Link href={commentHref}><Button variant='ghost'><MessageCircle className='h-5'/>{docCommentCount || ''}</Button></Link>

            <Button variant='ghost' onClick={() => dispatch(openUI({ key: 'docOptionsDrawer', data: { docId: docId, isOwner: isOwner, deleteDoc: deleteDoc } }))}><Ellipsis className='h-5'/></Button>

        </div>

    );
}