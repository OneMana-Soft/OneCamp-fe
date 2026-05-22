"use client"

import MinimalTiptapTextInput from "@/components/textInput/textInput";
import { cn } from "@/lib/utils/helpers/cn";
import { SendHorizontal } from "@/lib/icons";
import DraggableDrawer from "@/components/drawers/dragableDrawer";
import { useEffect, useRef, useState } from "react";
import { ChannelFileUpload } from "@/components/fileUpload/channelFileUpload";
import {openUI} from "@/store/slice/uiSlice";
import {useDispatch, useSelector} from "react-redux";

import {UserProfileDataInterface, UserProfileInterface} from "@/types/user";
import {CreateOrUpdatePostsReq, CreatePostsRes, PostsResRaw} from "@/types/post";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {usePost} from "@/hooks/usePost";
import {RootState} from "@/store/store";
import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch";
import {CreateCommentResInterface, CreateUpdateCommentReqInterface} from "@/types/comment";
import {clearChannelCommentMsgInputState, createOrUpdateChannelCommentMsg} from "@/store/slice/channelCommentSlice";
import {
    clearChatCommentInputState,
    createChatComment,
    createOrUpdateChatCommentBody
} from "@/store/slice/chatCommentSlice";
import { updateChatMessageReplyIncrement} from "@/store/slice/chatSlice";
import {ChatCommentFileUpload} from "@/components/fileUpload/chatCommentFileUpload";
import {removeEmptyPTags} from "@/lib/utils/removeEmptyPTags";

export const MobileChatMessageTextInput = ({ chatId, chatMessageUUID }: { chatId: string, chatMessageUUID: string }) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null); // New ref for the entire content
    const [isExpanded, setIsExpanded] = useState(false);
    const [initialHeight, setInitialHeight] = useState(126); // Default height
    const dispatch = useDispatch();

    const post = usePost()

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const chatCommentState = useSelector((state: RootState) => state.chatComments.chatCommentInputState[chatMessageUUID] || {});


    useEffect(() => {
        if (!contentRef.current) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                // Update initialHeight based on the entire content height
                setInitialHeight(Math.max(entry.contentRect.height, 30) + 70);
            }
        });

        resizeObserver.observe(contentRef.current);

        return () => resizeObserver.disconnect();
    }, []);


    const handleSend = (latestContent?: string) => {
        const rawBody = latestContent ?? chatCommentState.commentBody
        const body = removeEmptyPTags(rawBody)

        if(body.length==0) return


        post.makeRequest<CreateUpdateCommentReqInterface, CreateCommentResInterface>({
            apiEndpoint: PostEndpointUrl.CreateChatComment,
            payload: {
                chat_id: chatMessageUUID,
                comment_attachments: chatCommentState.filesUploaded,
                comment_text_html: body,
            }
        })
            .then((res)=>{

                if(res?.comment_id && selfProfile.data?.data) {
                    dispatch(createChatComment({commentId: res?.comment_id, commentCreatedAt: res?.comment_created_at, commentText: body, chatId: chatMessageUUID, commentBy: selfProfile.data?.data, attachments:chatCommentState.filesUploaded}))

                    dispatch(updateChatMessageReplyIncrement({messageId: chatMessageUUID, chatId: chatId, comment: {comment_text: "", comment_created_at: res?.comment_created_at || new Date().toISOString(), comment_uuid: res?.comment_id || '', comment_by: selfProfile.data?.data || {user_uuid: '', user_name: '', user_profile_object_key: ''}}}))

                }

                // chatInfo.mutate()
                dispatch(clearChatCommentInputState({chatUUID:chatMessageUUID}))


            })
    }

    return (
        <DraggableDrawer isExpanded={isExpanded} setIsExpanded={setIsExpanded} initialHeight={initialHeight}>
            <div ref={contentRef}> {/* Wrap all content in a ref */}
                <div ref={editorRef}>
                    <MinimalTiptapTextInput
                        attachmentOnclick={() => { dispatch(openUI({ key: 'chatCommentFileUpload' }))
 }}
                        throttleDelay={300}
                        noBorder={true}
                        className={cn("max-w-full rounded-xl h-auto border-none")}
                        editorContentClassName="overflow-auto mb-2"
                        output="html"
                        content={chatCommentState.commentBody}
                        placeholder={"Reply..."}
                        editable={true}
                        buttonOnclick={handleSend}
                        ButtonIcon={SendHorizontal}
                        editorClassName="focus:outline-none px-5"
                        onChange={(content ) => {

                            dispatch(createOrUpdateChatCommentBody({chatUUID: chatMessageUUID, body: content as string}))
                        }}
                        fixedToolbarToBottom={true}
                    >



                    </MinimalTiptapTextInput>
                    <div className='pb-2'>
                        <ChatCommentFileUpload chatMessageUUID={chatMessageUUID} chatUUID={chatId}/>

                    </div>
                </div>
            </div>
        </DraggableDrawer>
    );
};