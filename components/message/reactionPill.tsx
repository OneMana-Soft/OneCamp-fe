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
                        <Button
                            variant="outline"
                            onClick={onClickEmojiHandle}
                            className={`px-1.5 h-6 rounded-full items-center gap-1 transition-colors ${
                                isSelected
                                    ? "bg-blue-100 border-blue-400 text-blue-700 hover:bg-blue-100 dark:bg-blue-500/20 dark:border-blue-500/40 dark:text-blue-300 dark:hover:bg-blue-500/20"
                                    : ""
                            }`}
                        >
                            <div className='flex justify-center items-center gap-1'>
                                <span className="text-base leading-none">{emojiString}</span>
                                <span className="text-xs font-medium tabular-nums">
                                    {reactionUserNames.length || 0}
                                </span>
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