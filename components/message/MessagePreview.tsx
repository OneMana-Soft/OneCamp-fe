import {UserProfileDataInterface} from "@/types/user";
import {cn} from "@/lib/utils/helpers/cn";
import {ExternalLink, SendHorizontal} from "lucide-react";
import MinimalTiptapTextInput from "@/components/textInput/textInput";
import {MessagePreviewAvatar} from "@/components/message/MessagePreviewAvatar";
import {formatTimeForPostOrComment} from "@/lib/utils/date/formatTimeForPostOrComment";
import {Button} from "@/components/ui/button";

interface MsgPreviewProps {
    msgText?: string
    msgBy?: UserProfileDataInterface
    msgChannelName?: string
    msgChannelUUID?: string
    msgUUID?: string
    msgCreatedAt?: string
    vewFooter?:boolean
}
export function MessagePreview (msgInfo : MsgPreviewProps) {


    return (

        <div className='relative flex space-x-4'>
            <div className='h-full bg-secondary/60 w-1.5 absolute rounded-full'/>

            <div className='flex-col pl-4'>

                <div className='flex space-x-2'>
                    <MessagePreviewAvatar userInfo={msgInfo.msgBy}/>
                    <div>
                        <div className='text-sm'>{msgInfo.msgBy?.user_name || msgInfo.msgChannelName}</div>
                        <div className='text-xs text-muted-foreground text'>
                            {msgInfo.msgCreatedAt && formatTimeForPostOrComment(msgInfo.msgCreatedAt)}

                        </div>

                    </div>

                </div>

                <div className='max-h-48 overflow-hidden'>
                <MinimalTiptapTextInput
                    throttleDelay={300}
                    isOutputText={true}
                    className={cn("max-w-full rounded-xl h-auto border-none mt-2")}
                    editorContentClassName="overflow-auto "
                    output="html"
                    content={msgInfo.msgText}
                    placeholder={"message"}
                    editable={false}
                    ButtonIcon={SendHorizontal}
                    buttonOnclick={() => {
                    }}
                    editorClassName="focus:outline-none "

                >
                </MinimalTiptapTextInput>
                </div>

                {msgInfo.vewFooter && <div className='text-xs text-muted-foreground '>

                    {
                        msgInfo.msgChannelUUID ?
                        <>

                            <span className="hover:underline hover:cursor-pointer "><span>Posted in </span>#{msgInfo.msgChannelName} </span>
                            <Button
                                variant="link"
                                size="sm"
                                className="ml-2 h-auto p-0 text-xs text-blue-600 hover:text-blue-800"
                                onClick={()=>{}}
                            >
                                view message
                            </Button>
                        </>

                        :

                        <>

                            <span className="hover:underline hover:cursor-pointer "><span>Direct message </span>{msgInfo.msgChannelName}</span>
                            <Button
                                variant="link"
                                size="sm"
                                className="ml-2 h-auto p-0 text-xs text-blue-600 hover:text-blue-800"
                                onClick={()=>{}}
                            >
                                view conversation
                            </Button>
                        </>

                    }
                </div>}

            </div>
        </div>
    )
}