"use client"

import { THREAD_COMPOSER_PLACEHOLDER } from "@/lib/utils/composerPlaceholders";
import MinimalTiptapTextInput from "@/components/textInput/textInput";
import { SendHorizontal } from "@/lib/icons";
import { PhoneComposerDrawer } from "@/components/textInput/phoneComposerDrawer";
import { ThreadCommandSurface } from "@/components/command/ThreadCommandSurface";
import { useState } from "react";
import { openUI } from "@/store/slice/uiSlice";
import { useDispatch, useSelector } from "react-redux";

import { UserProfileInterface } from "@/types/user";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import { usePost } from "@/hooks/usePost";
import { RootState } from "@/store/store";
import { useFetchOnlyOnce } from "@/hooks/useFetch";
import { CreateCommentResInterface, CreateUpdateCommentReqInterface } from "@/types/comment";
import { clearChatCommentInputState, createChatComment, createOrUpdateChatCommentBody } from "@/store/slice/chatCommentSlice";
import { updateChatMessageReplyIncrement } from "@/store/slice/chatSlice";
import { ChatCommentFileUpload } from "@/components/fileUpload/chatCommentFileUpload";
import { removeEmptyPTags } from "@/lib/utils/removeEmptyPTags";

// Module-level, so a composer with no draft yet gets the same value on every
// store change: a fresh {} per call re-drew it, editor and all, whenever
// anything in the app changed.
const NO_DRAFT = {}

export const MobileChatMessageTextInput = ({ chatId, chatMessageUUID }: { chatId: string, chatMessageUUID: string }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const dispatch = useDispatch();

    const post = usePost()

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const chatCommentState = useSelector((state: RootState) => state.chatComments.chatCommentInputState[chatMessageUUID] || NO_DRAFT);


    const handleSend = (latestContent?: string) => {
        const files = chatCommentState.filesUploaded ?? []
        const rawBody = latestContent ?? chatCommentState.commentBody
        const body = removeEmptyPTags(rawBody)

        if(body.length==0) return


        post.makeRequest<CreateUpdateCommentReqInterface, CreateCommentResInterface>({
            apiEndpoint: PostEndpointUrl.CreateChatComment,
            payload: {
                chat_id: chatMessageUUID,
                comment_attachments: files,
                comment_text_html: body,
            }
        })
            .then((res)=>{

                if(res?.comment_id && selfProfile.data?.data) {
                    dispatch(createChatComment({commentId: res?.comment_id, commentCreatedAt: res?.comment_created_at, commentText: body, chatId: chatMessageUUID, commentBy: selfProfile.data?.data, attachments: files}))

                    dispatch(updateChatMessageReplyIncrement({messageId: chatMessageUUID, chatId: chatId, comment: {comment_text: "", comment_created_at: res?.comment_created_at || new Date().toISOString(), comment_uuid: res?.comment_id || '', comment_by: selfProfile.data?.data || {user_uuid: '', user_name: '', user_profile_object_key: ''}}}))

                }

                // chatInfo.mutate()
                dispatch(clearChatCommentInputState({threadId: chatMessageUUID, sent: files.map((f) => f.attachment_obj_key)}))


            })
    }

    return (
        <PhoneComposerDrawer
            expanded={isExpanded}
            onExpandedChange={setIsExpanded}
            answers={<ThreadCommandSurface kind="dm" conversation={chatId} thread={chatMessageUUID} />}
        >
            <MinimalTiptapTextInput
                key={chatMessageUUID}
                attachmentOnclick={() => { dispatch(openUI({ key: 'chatCommentFileUpload' }))
 }}
                throttleDelay={300}
                variant="phone"
                expanded={isExpanded}
                onExpandedChange={setIsExpanded}
                output="html"
                content={chatCommentState.commentBody}
                placeholder={THREAD_COMPOSER_PLACEHOLDER}
                editable={true}
                buttonOnclick={handleSend}
                ButtonIcon={SendHorizontal}
                hasAttachments={(chatCommentState.filesUploaded?.length ?? 0) > 0}
                editorClassName="focus:outline-none"
                onChange={(content ) => {

                    dispatch(createOrUpdateChatCommentBody({threadId: chatMessageUUID, body: content as string}))
                }}
            >



            </MinimalTiptapTextInput>
            <div className='px-3'>
                <ChatCommentFileUpload chatMessageUUID={chatMessageUUID} chatUUID={chatId}/>

            </div>
        </PhoneComposerDrawer>
    );
};