"use client";


import {useMedia} from "@/context/MediaQueryContext";
import {DocTopBarBreadcrumb} from "@/components/doc/docTopBarBreadcrumb";
import DocOptionsDesktopTopBar from "@/components/doc/docOptionsDesktopTopBar";
import MinimalTiptapDocInput from "@/components/docEditor/docInput";
import {cn} from "@/lib/utils/helpers/cn"; // Your custom hook
import { useParams } from "next/navigation";
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";
import { UserProfileInterface } from "@/types/user";
import { getCookie, checkAuthCookieExists, checkRefreshCookieExists } from "@/lib/utils/helpers/getCookie";
import * as React from 'react';
import {generateColorFromUUID} from "@/lib/utils/generateColorFromUUID";
import {DocInfoInterface, DocInfoResponse} from "@/types/doc";
import {MessageCircle} from "lucide-react";
import {Button} from "@/components/ui/button";
import {useDispatch, useSelector} from "react-redux";
import {openRightPanel} from "@/store/slice/desktopRightPanelSlice";
import type {RootState} from "@/store/store";
import {CommentInfoInterface} from "@/types/comment";
import {useEffect} from "react";
import {updateDocCommentCount} from "@/store/slice/createDocCommentSlice";
import {useMqttTopic} from "@/hooks/useMqttTopic";
import { DocPageSkeleton } from "@/components/doc/DocPageSkeleton";
import { useDocMessageHandlers } from "@/hooks/useDocMessageHandlers";
import { HocuspocusProvider } from '@hocuspocus/provider';


export default function Page() {
    const params = useParams();
    const docId = params?.['doc-id'] as string;
    const userProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile);

    const dispatch = useDispatch();
    const { handleDocCommentMessage, handleDocCommentReactionMessage } = useDocMessageHandlers({ userUuid: userProfile.data?.data?.user_uuid });

    // Fetch document info
    const { data: docInfoHelper, isLoading: isDocLoading } = useFetch<DocInfoResponse>(docId ? `${GetEndpointUrl.GetDocInfo}/${docId}` : '');
    const docInfo = docInfoHelper?.data;

    // Subscribe to document MQTT topic for real-time updates
    useMqttTopic({
        topic: docInfo?.doc_mqtt_topic || "",
        onMessage: (message, topic) => {
            const messageStr = message.toString();
            // Handle different types of messages based on topic/content if necessary
            // For now routing to standard doc handlers
            handleDocCommentMessage(messageStr);
            handleDocCommentReactionMessage(messageStr);
        }
    });

    const docCommentCount = useSelector((state: RootState) => state.createDocComment.docCommentCount[docId]);

    const [token, setToken] = React.useState<string>(() => {
        if (typeof window !== 'undefined') {
            return getCookie("Authorization") || '';
        }
        return '';
    });
    const { isMobile, isDesktop } = useMedia();

    useEffect(() => {

        if(docInfo) {
            dispatch(updateDocCommentCount({docId: docId, newCount: docInfo?.doc_comment_count||0}))
        }

    }, [docInfo])

    // Determine edit access
    const hasEditAccess = React.useMemo(() => {
        if (!docInfo || !userProfile.data?.data) return false;
        
        const userId = userProfile.data.data.user_uuid;
        const isCreator = docInfo.doc_created_by?.user_uuid === userId;
        // Check if user has explicit edit access or is the creator
        // Assuming doc_edit_access is a count/flag returned by backend for this user context
        // If the backend returns doc_edit_access based on the requesting user's permissions:
        return isCreator || (docInfo.doc_edit_access > 0);
    }, [docInfo, userProfile.data?.data]);


    const collaboration = React.useMemo(() => {
        // STRICT: Only enable collaboration if user has edit access
        if (!hasEditAccess || !docId || !token || !userProfile.data?.data) return undefined;
        
        return {
            enabled: true,
            documentId: docId,
            token: token,
            username: userProfile.data.data.user_full_name || userProfile.data.data.user_name || 'Anonymous',
            color: generateColorFromUUID(userProfile.data?.data?.user_uuid || "defaullt"),

        };
    }, [docId, token, userProfile.data?.data, hasEditAccess]);

    const handleCommentClick = () => {

        if(isDesktop) {
            dispatch(openRightPanel({
                docUUID: docId,
                taskUUID: "",
                chatMessageUUID: "",
                chatUUID: "",
                channelUUID: "",
                postUUID: "",
                groupUUID: ""
            }))
        }
    }

    const [provider, setProvider] = React.useState<HocuspocusProvider | null>(null);

    React.useEffect(() => {
        if (collaboration?.enabled && !provider) {
            const newProvider = new HocuspocusProvider({
                url: process.env.NEXT_PUBLIC_COLLABORATION_URL || 'ws://localhost:1234',
                name: collaboration.documentId,
                token: collaboration.token,
                onStatus: (data: any) => {
                    // console.log('Doc Status:', data.status)
                },
            });
            setProvider(newProvider);
            return () => {
                newProvider.destroy();
            };
        }
    }, [collaboration?.enabled, collaboration?.documentId, collaboration?.token]);

    if(!docId) {
        return null;
    }

    if (isDocLoading || userProfile.isLoading || (!token && checkAuthCookieExists())) {
        return <DocPageSkeleton />;
    }

    if (!docInfo) {
         return <div className="flex items-center justify-center h-full">Document not found or access denied.</div>;
    }

    if (collaboration?.enabled && !provider) {
        return <DocPageSkeleton />;
    }

    return (
        <div className='flex flex-col h-full'>

        {
            isDesktop &&
            <div className='h-14 items-center flex justify-between p-2 pl-4 pr-4 border-b'>
                <DocTopBarBreadcrumb doc={docInfo} canEdit={hasEditAccess} />
                <div className='flex'>
                    <Button variant='ghost' onClick={handleCommentClick}><MessageCircle className='h-5'/>{docCommentCount}</Button>
                    <DocOptionsDesktopTopBar/>
                </div>
            </div>
        }
            <MinimalTiptapDocInput
                throttleDelay={3000}
                className={cn('h-full flex-1 w-full rounded-xl')}
                editorContentClassName="overflow-auto h-full p-2"
                output="json"
                onChange={value => {
                    // Only log changes if needed, or handle save logic if not using Yjs exclusively
                }}
                placeholder="Start typing..."
                // If collaboration is enabled, value is managed by Yjs. 
                // If not (read-only), we might need to set initial content.
                // However, MinimalTiptapDocInput likely handles `value` or `content` prop.
                value={!collaboration?.enabled ? docInfo.doc_body : undefined}
                editable={hasEditAccess}
                editorClassName="focus:outline-none px-2 py-2 h-full"
                collaboration={collaboration}
                provider={provider || undefined}
                docId={docId}
            />

        </div>
    );
}
