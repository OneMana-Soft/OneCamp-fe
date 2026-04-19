"use client"

import MinimalTiptapTextInput from "@/components/textInput/textInput";
import { cn } from "@/lib/utils/helpers/cn";
import { SendHorizontal } from "lucide-react";
import DraggableDrawer from "@/components/drawers/dragableDrawer";
import { useEffect, useRef, useState } from "react";
import { ChannelFileUpload } from "@/components/fileUpload/channelFileUpload";
import {openUI} from "@/store/slice/uiSlice";
import {useDispatch, useSelector} from "react-redux";
import type { RootState } from "@/store/store";
import {

    updateChannelInputText
} from "@/store/slice/channelSlice";
import {createOrUpdateChatBody} from "@/store/slice/chatSlice";
import {ChatFileUpload} from "@/components/fileUpload/chatFileUpload";
import {usePublishTyping} from "@/hooks/usePublishTyping";
import {useUploadFile} from "@/hooks/useUploadFile";
import {getGroupingId} from "@/lib/utils/getGroupingId";
import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {UserProfileInterface} from "@/types/user";
import {GetEndpointUrl} from "@/services/endPoints";


const EMPTY_CHAT_INPUT_STATE = {};

export const MobileChatTextInput = ({ chatId, handleSend }: { chatId: string, handleSend: ()=>void }) => {
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const uploadFile = useUploadFile()
    const editorRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null); // New ref for the entire content
    const [isExpanded, setIsExpanded] = useState(false);
    const [initialHeight, setInitialHeight] = useState(126); // Default height
    const dispatch = useDispatch();
    const { publishTyping } = usePublishTyping({ targetType: 'chat', targetId: chatId });



    const chatInputState = useSelector((state: RootState) => state.chat.chatInputState[chatId] || EMPTY_CHAT_INPUT_STATE);

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



    return (
        <DraggableDrawer isExpanded={isExpanded} setIsExpanded={setIsExpanded} initialHeight={initialHeight}>
            <div ref={contentRef}> {/* Wrap all content in a ref */}
                <div ref={editorRef}>
                    <MinimalTiptapTextInput
                        attachmentOnclick={() => { dispatch(openUI({ key: 'chatFileUpload' })) }}
                        onActionFiles={async (files) => {
                            if (!files?.length) return;
                            const grpId = getGroupingId(chatId, selfProfile.data?.data.user_uuid || '')
                            await uploadFile.makeRequestToUploadToChat(files as unknown as FileList, chatId, grpId);
                        }}
                        throttleDelay={300}
                        className={cn("max-w-full rounded-xl h-auto border-none")}
                        editorContentClassName="overflow-auto mb-2"
                        output="html"
                        content={chatInputState.chatBody}
                        placeholder={"message"}
                        editable={true}
                        buttonOnclick={handleSend}
                        ButtonIcon={SendHorizontal}
                        editorClassName="focus:outline-none px-5"
                        onChange={(content ) => {
                            publishTyping()
                            dispatch(createOrUpdateChatBody({chatUUID: chatId, body: content?.toString()||'' }))
                        }}
                        fixedToolbarToBottom={true}
                    >



                    </MinimalTiptapTextInput>
                    <div className='pb-2'>
                        <ChatFileUpload chatUUID={chatId}/>

                    </div>
                </div>
            </div>
        </DraggableDrawer>
    );
};