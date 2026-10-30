"use client"

import { THREAD_COMPOSER_PLACEHOLDER } from "@/lib/utils/composerPlaceholders";
import MinimalTiptapTextInput from "@/components/textInput/textInput";
import { SendHorizontal } from "@/lib/icons";
import { PhoneComposerDrawer } from "@/components/textInput/phoneComposerDrawer";
import { ThreadCommandSurface } from "@/components/command/ThreadCommandSurface";
import { useState } from "react";
import { openUI } from "@/store/slice/uiSlice";
import { useDispatch, useSelector } from "react-redux";
import { updateChannelMessageReplyIncrement } from "@/store/slice/channelSlice";
import { UserProfileInterface } from "@/types/user";
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints";
import { usePost } from "@/hooks/usePost";
import { RootState } from "@/store/store";
import { useFetchOnlyOnce } from "@/hooks/useFetch";
import { CreateCommentResInterface, CreateUpdateCommentReqInterface } from "@/types/comment";
import { clearChannelCommentMsgInputState, createChannelComment, createOrUpdateChannelCommentMsg } from "@/store/slice/channelCommentSlice";
import { ChannelCommentFileUpload } from "@/components/fileUpload/channelCommentFileUpload";
import { removeEmptyPTags } from "@/lib/utils/removeEmptyPTags";

// Module-level, so a composer with no draft yet gets the same value on every
// store change: a fresh {} per call re-drew it, editor and all, whenever
// anything in the app changed.
const NO_DRAFT = {}

export const MobileChannelPostTextInput = ({ channelId, postUUID }: { channelId: string, postUUID: string }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)

    const dispatch = useDispatch();

    const post = usePost()

    // const postInfo = useFetch<PostsResRaw>(
    //     channelId && postUUID ? `${GetEndpointUrl.GetPostWithAllComments}/${postUUID}` : "",
    // )

    // The reply being written: this thread's own draft, not the channel's (MC-BUG-1).
    const channelPostState = useSelector((state: RootState) => state.channelComment.commentInputState[postUUID] || NO_DRAFT);


    const handleSend = (latestContent?: string) => {

        const files = channelPostState.filesUploaded ?? []
        const rawBody = latestContent ?? channelPostState.commentMsgBody
        const body = removeEmptyPTags(rawBody)

        if(body.length==0) return


        post.makeRequest<CreateUpdateCommentReqInterface, CreateCommentResInterface>({
            apiEndpoint: PostEndpointUrl.CreatePostComment,
            payload: {
                post_id: postUUID,
                comment_attachments: files,
                comment_text_html: body,
            }
        })
            .then((res)=>{

                // postInfo.mutate()

                if(res?.comment_id && selfProfile.data?.data) {
                    dispatch(createChannelComment({commentId: res?.comment_id, commentCreatedAt: res?.comment_created_at, commentText: body, postId: postUUID, commentBy: selfProfile.data?.data, attachments: files}))

                }

                // postInfo.mutate()
                dispatch(clearChannelCommentMsgInputState({threadId: postUUID, sent: files.map((f) => f.attachment_obj_key)}))

                dispatch(updateChannelMessageReplyIncrement({channelId: channelId, messageId: postUUID, comment:{comment_uuid: res?.comment_id||'', comment_created_at: res?.comment_created_at || new Date().toISOString(), comment_text: "", comment_by: selfProfile.data?.data || {user_uuid: '', user_name: '', user_profile_object_key: ''}}}))



            })
    }

    return (
        <PhoneComposerDrawer
            expanded={isExpanded}
            onExpandedChange={setIsExpanded}
            answers={<ThreadCommandSurface kind="channel" conversation={channelId} thread={postUUID} />}
        >
            <MinimalTiptapTextInput
                key={postUUID}
                attachmentOnclick={() => { dispatch(openUI({ key: 'channelCommentFileUpload' })) }}
                throttleDelay={300}
                variant="phone"
                expanded={isExpanded}
                onExpandedChange={setIsExpanded}
                output="html"
                content={channelPostState.commentMsgBody}
                placeholder={THREAD_COMPOSER_PLACEHOLDER}
                editable={true}
                buttonOnclick={handleSend}
                ButtonIcon={SendHorizontal}
                hasAttachments={(channelPostState.filesUploaded?.length ?? 0) > 0}
                editorClassName="focus:outline-none"
                onChange={(content ) => {

                    dispatch(createOrUpdateChannelCommentMsg({threadId: postUUID, body: content as string}))
                }}
            >



            </MinimalTiptapTextInput>
            <div className='px-3'>
                <ChannelCommentFileUpload channelId={channelId} threadId={postUUID} />

            </div>
        </PhoneComposerDrawer>
    );
};