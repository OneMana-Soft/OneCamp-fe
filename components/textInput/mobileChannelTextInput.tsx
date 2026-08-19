"use client"

import MinimalTiptapTextInput from "@/components/textInput/textInput";
import { cn } from "@/lib/utils/helpers/cn";
import { SendHorizontal } from "@/lib/icons";
import DraggableDrawer from "@/components/drawers/dragableDrawer";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChannelFileUpload } from "@/components/fileUpload/channelFileUpload";
import { openUI } from "@/store/slice/uiSlice";
import {useDispatch, useSelector} from "react-redux";
import {

    updateChannelInputText
} from "@/store/slice/channelSlice";
import {RootState} from "@/store/store";
import {usePublishTyping} from "@/hooks/usePublishTyping";
import {useUploadFile} from "@/hooks/useUploadFile";
import { useFetchOnlyOnce } from "@/hooks/useFetch";
import { ChannelInfoInterfaceResp } from "@/types/channel";
import { GetEndpointUrl } from "@/services/endPoints";
import CommandSurface from "@/components/command/CommandSurface";


export const MobileChannelTextInput = ({ channelId, handleSend }: { channelId: string, handleSend: (latestContent?: string)=>void }) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null); // New ref for the entire content
    const [isExpanded, setIsExpanded] = useState(false);
    const [initialHeight, setInitialHeight] = useState(126); // Default height
    const dispatch = useDispatch();
    const { publishTyping } = usePublishTyping({ targetType: 'channel', targetId: channelId });
    const uploadFile = useUploadFile()

    const channelInputState = useSelector((state: RootState) => state.channel.channelInputState[channelId] || {});

    // Resolve the channel display name with the same fallback chain as
    // chanelIdDesktop so the placeholder reads "Message #engineering"
    // instead of the literal "Message #channel". Sidebar state first
    // (already cached), then API response, then a generic fallback.
    const userChannels = useSelector((state: RootState) => state.users.userSidebar.userChannels);
    const channelInSidebar = useMemo(
        () => userChannels?.find((c) => c.ch_uuid === channelId),
        [userChannels, channelId],
    );
    const channelInfo = useFetchOnlyOnce<ChannelInfoInterfaceResp>(
        channelId && !channelInSidebar ? `${GetEndpointUrl.ChannelBasicInfo}/${channelId}` : "",
    );
    const channelDisplayName =
        channelInSidebar?.ch_name || channelInfo.data?.channel_info?.ch_name || "channel";

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
            <CommandSurface
                surfaceKey={channelId}
                channelId={channelId}
                onComposerText={(text) =>
                    dispatch(updateChannelInputText({ channelId, inputTextHTML: `<p>${text}</p>` }))
                }
                onComposerHtml={(html) =>
                    dispatch(updateChannelInputText({ channelId, inputTextHTML: html }))
                }
            />
            <div ref={contentRef}> {/* Wrap all content in a ref */}
                <div ref={editorRef}>
                    <MinimalTiptapTextInput
                        attachmentOnclick={() => { dispatch(openUI({ key: 'channelFileUpload' })) }}
                        onActionFiles={async (files) => {
                            if (!files?.length) return;
                            const valid = uploadFile.validateFiles(files);
                            if (valid.length === 0) return;
                            await uploadFile.makeRequestToUploadToChannel(valid as unknown as FileList, channelId);
                        }}
                        throttleDelay={300}
                        noBorder={true}
                        className={cn("max-w-full h-auto")}
                        editorContentClassName="overflow-auto mb-2"
                        output="html"
                        content={channelInputState.inputTextHTML}
                        placeholder={`Message #${channelDisplayName}`}
                        editable={true}
                        buttonOnclick={handleSend}
                        ButtonIcon={SendHorizontal}
                        editorClassName="focus:outline-none px-5"
                        onChange={(content ) => {
                            publishTyping(content as string)
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