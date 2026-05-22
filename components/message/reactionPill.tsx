import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
import {DropdownMenuTrigger} from "@/components/ui/dropdown-menu";
import {Button} from "@/components/ui/button";
import { MoreVertical } from "@/lib/icons";
import {useEmojiMartData} from "@/hooks/reactions/useEmojiMartData";
import {findEmojiMartEmojiByEmojiID} from "@/lib/utils/reaction/findReaction";

interface reactionPillProps {
    emojiId: string;
    reactionUserNames: string[];
    onClickEmoji: (emojiId: string) => void
    isSelected: boolean
}

export const ReactionPill =  ({ emojiId, reactionUserNames, onClickEmoji, isSelected}: reactionPillProps) => {

    const onClickEmojiHandle = (e: React.MouseEvent)=>{
        e.stopPropagation()
        onClickEmoji(emojiId)
    }

    const truncateString = (str: string, maxLength: number) => {
        return str.length > maxLength ? `${str.slice(0, maxLength)}...` : str;
    };

    const emojiData = useEmojiMartData()

    const emojiString = findEmojiMartEmojiByEmojiID(emojiData.data, emojiId)?.skins[0].native


    const reactionUserNamesString =  truncateString(reactionUserNames.join(', '), 50);

    return (
        <div 
            className='flex items-center gap-1' 
            onTouchStart={(e) => e.stopPropagation()} 
            data-no-ripple="true"
        >

            <Tooltip>
                <TooltipTrigger asChild>
                        <Button variant="outline" onClick={onClickEmojiHandle}  className={`bg-ascent px-1 h-6 rounded-full items-center text-sm ${isSelected?'bg-blue-200 border border-blue-500 dark:border-0 dark:bg-blue-700/80 hover:bg-blue-700/80':''}`}>
                            <div className='flex justify-center items-center gap-1'>
                                <span className="text-base">{emojiString}</span>
                                <div >
                                    {reactionUserNames.length || 0}
                                </div>
                            </div>
                        </Button>
                </TooltipTrigger>
                <TooltipContent>
                    <p className='text-xs'>{reactionUserNamesString}</p>
                </TooltipContent>
            </Tooltip>

        </div>
    );
}