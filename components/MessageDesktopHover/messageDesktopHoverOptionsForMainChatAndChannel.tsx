import {Button} from "@/components/ui/button";
import {Bookmark, Forward, MessageSquareText, MoreVertical} from "lucide-react";
import MessageDesktopDropdown from "@/components/MessageDesktopHover/MessageDesktopDropdown";
import {useDispatch} from "react-redux";
import {openUI} from "@/store/slice/uiSlice";
import {openRightPanel} from "@/store/slice/desktopRightPanelSlice";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
import {useState} from "react";
import {AddReactionTrigger} from "@/components/reactionPicker/AddReactionTrigger";
import {motion} from "framer-motion";


interface MessageDesktopHoverOptionProps {
    setIsDropdownOpen: (open: boolean) => void;
    chatUUID?: string;
    groupUUID?: string;
    chatMessageID?: string;
    channelUUID?: string;
    postUUID?: string;
    getReplyNotification?: () => void;
    setEmojiPopupState?: (open: boolean) => void;
    editMessage: () => void;
    deleteMessage: () => void;
    isAdmin?: boolean;
    isOwner: boolean;
    onReactionSelect: (id: string) => void;
}
// raised_hands
export const MessageDesktopHoverOptionsForMainChatAndChannel = ({ groupUUID, isOwner, isAdmin, setEmojiPopupState, setIsDropdownOpen, channelUUID, chatUUID, postUUID, deleteMessage, editMessage, getReplyNotification, onReactionSelect, chatMessageID }: MessageDesktopHoverOptionProps) => {
    const dispatch = useDispatch();

    

    return (
        <motion.div 
            initial={{ opacity: 0, x: 10, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className='bg-background/80 backdrop-blur-md rounded-lg flex items-center space-x-0.5 border shadow-lg p-1'
        >
            <Button variant="ghost" size="icon" className="h-8 w-8 " onClick={()=>{onReactionSelect('white_check_mark')}}>
                {'✅'}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 " onClick={()=>{onReactionSelect('eyes')}}>
                {'👀'}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={()=>{onReactionSelect('raised_hands')}}>
                {'🙌'}
            </Button>
            <AddReactionTrigger onReactionSelect={(id)=>{ onReactionSelect(id) }} showCustomReactions={false} setPopupState={setEmojiPopupState} />

            <Tooltip >
                <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 " onClick={()=>{dispatch(openRightPanel({
                        taskUUID: "",
                        docUUID: "",
                        chatMessageUUID: chatMessageID || '',
                        postUUID: postUUID||'', channelUUID: channelUUID || '', chatUUID: chatUUID || '', groupUUID: groupUUID || ''}))}}>
                        <MessageSquareText className="h-4 w-4" stroke='#616060'/>
                    </Button>
                </TooltipTrigger>
                <TooltipContent  className="flex items-center gap-4">

                        <span className="ml-auto">
                    {"Thread"}
                  </span>

                </TooltipContent>
            </Tooltip>
            <Tooltip >
                <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={()=>{dispatch(openUI({ key: 'forwardMessage', data: {
                        chatUUID: chatUUID || '',
                        chatMessageID: !groupUUID ? (chatMessageID || '') : '',
                        groupChatMsgID: groupUUID ? (chatMessageID || '') : '',
                        channelUUID: channelUUID || '',
                        postUUID: postUUID || ''
                    } }))}}>
                        <Forward className="h-4 w-4" stroke='#616060'/>
                    </Button>
                </TooltipTrigger>
                <TooltipContent  className="flex items-center gap-4">

                        <span className="ml-auto">
                    {"Forward"}
                  </span>

                </TooltipContent>
            </Tooltip>
            {/*<Tooltip >*/}
            {/*    <TooltipTrigger asChild>*/}
            {/*        <Button variant="ghost" size="icon" className="h-8 w-8 ">*/}
            {/*            <Bookmark className="h-4 w-4" stroke='#616060' />*/}
            {/*        </Button>*/}
            {/*    </TooltipTrigger>*/}
            {/*    <TooltipContent  className="flex items-center gap-4">*/}

            {/*            <span className="ml-auto">*/}
            {/*        {"Save for later"}*/}
            {/*      </span>*/}

            {/*    </TooltipContent>*/}
            {/*</Tooltip>*/}


            { (isAdmin || isOwner || getReplyNotification) && <MessageDesktopDropdown isAdmin={isAdmin} isOwner={isOwner} setIsDropdownOpen={setIsDropdownOpen} deleteMessage={deleteMessage} editMessage={editMessage} getReplyNotification={getReplyNotification}/>}
        </motion.div>
    )
}

