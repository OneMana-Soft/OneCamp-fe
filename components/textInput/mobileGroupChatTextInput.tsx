"use client"

import MinimalTiptapTextInput from "@/components/textInput/textInput";
import { cn } from "@/lib/utils/helpers/cn";
import { SendHorizontal } from "lucide-react";
import DraggableDrawer from "@/components/drawers/dragableDrawer";
import { useEffect, useRef, useState } from "react";
import { ChannelFileUpload } from "@/components/fileUpload/channelFileUpload";
import {openUI} from "@/store/slice/uiSlice";
import {useDispatch, useSelector} from "react-redux";
import {

    updateChannelInputText
} from "@/store/slice/channelSlice";
import {ChatFileUpload} from "@/components/fileUpload/chatFileUpload";
import {GroupChatFileUpload} from "@/components/fileUpload/groupChatFileUpload";
import {RootState} from "@/store/store";
import {createOrUpdateGroupChatBody} from "@/store/slice/groupChatSlice";
import {usePublishTyping} from "@/hooks/usePublishTyping";
import {useUploadFile} from "@/hooks/useUploadFile";

const EMPTY_CHAT_INPUT_STATE = {};

export const MobileGroupChatTextInput = ({ grpId, handleSend }: { grpId: string, handleSend: ()=>void }) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null); // New ref for the entire content
    const [isExpanded, setIsExpanded] = useState(false);
    const [initialHeight, setInitialHeight] = useState(126); // Default height
    const dispatch = useDispatch();
    const { publishTyping } = usePublishTyping({ targetType: 'groupChat', targetId: grpId });
    const uploadFile = useUploadFile()


    const chatInputState = useSelector((state: RootState) => state.groupChat.chatInputState[grpId] || EMPTY_CHAT_INPUT_STATE);

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
                        attachmentOnclick={() => { dispatch(openUI({ key: 'groupChatFileUpload' }))
 }}
                        onActionFiles={async (files) => {
                            if (!files?.length) return;
                            await uploadFile.makeRequestToUploadToGroupChat(files as unknown as FileList, grpId);
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
                            dispatch(createOrUpdateGroupChatBody({grpID: grpId, body: content?.toString()||'' }))
                        }}
                        fixedToolbarToBottom={true}
                    >



                    </MinimalTiptapTextInput>
                    <div className='pb-2'>
                        <GroupChatFileUpload groupChatID={grpId}/>

                    </div>
                </div>
            </div>
        </DraggableDrawer>
    );
};