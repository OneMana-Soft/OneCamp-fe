"use client"

import MinimalTiptapTextInput from "@/components/textInput/textInput";
import { cn } from "@/lib/utils/helpers/cn";
import { SendHorizontal } from "lucide-react";
import DraggableDrawer from "@/components/drawers/dragableDrawer";
import { useEffect, useRef, useState } from "react";
import { ChannelFileUpload } from "@/components/fileUpload/channelFileUpload";
import { openUI } from "@/store/slice/uiSlice";
import {useDispatch, useSelector} from "react-redux";
import {

    updateChannelInputText
} from "@/store/slice/channelSlice";
import {RootState} from "@/store/store";
import {TypingIndicator} from "@/components/typingIndicator/typyingIndicaator";
import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {UserProfileInterface} from "@/types/user";
import {usePublishTyping} from "@/hooks/usePublishTyping";
import {useUploadFile} from "@/hooks/useUploadFile";


export const MobileChannelTextInput = ({ channelId, handleSend }: { channelId: string, handleSend: ()=>void }) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null); // New ref for the entire content
    const [isExpanded, setIsExpanded] = useState(false);
    const [initialHeight, setInitialHeight] = useState(126); // Default height
    const dispatch = useDispatch();
    const { publishTyping } = usePublishTyping({ targetType: 'channel', targetId: channelId });
    const uploadFile = useUploadFile()

    const channelInputState = useSelector((state: RootState) => state.channel.channelInputState[channelId] || {});

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
                        attachmentOnclick={() => { dispatch(openUI({ key: 'channelFileUpload' })) }}
                        onActionFiles={async (files) => {
                            if (!files?.length) return;
                            await uploadFile.makeRequestToUploadToChannel(files as unknown as FileList, channelId);
                        }}
                        throttleDelay={300}
                        className={cn("max-w-full rounded-xl h-auto border-none")}
                        editorContentClassName="overflow-auto mb-2"
                        output="html"
                        content={channelInputState.inputTextHTML}
                        placeholder={"message"}
                        editable={true}
                        buttonOnclick={handleSend}
                        ButtonIcon={SendHorizontal}
                        editorClassName="focus:outline-none px-5 "
                        onChange={(content ) => {
                            publishTyping()
                            dispatch(updateChannelInputText({channelId, inputTextHTML: content as string}))
                        }}
                        fixedToolbarToBottom={true}
                    >



                    </MinimalTiptapTextInput>
                    <div className='pb-2'>
                        <ChannelFileUpload channelId={channelId} />

                    </div>
                </div>
            </div>
        </DraggableDrawer>
    );
};