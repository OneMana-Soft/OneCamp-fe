import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
import {Button} from "@/components/ui/button";
import {useEmojiMartData} from "@/hooks/reactions/useEmojiMartData";
import {findEmojiMartEmojiByEmojiID} from "@/lib/utils/reaction/findReaction";
import {cn} from "@/lib/utils/helpers/cn";
import {nameList} from "@/lib/utils/format/nameList";

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

    const emojiData = useEmojiMartData()
    const emoji = findEmojiMartEmojiByEmojiID(emojiData.data, emojiId)
    const emojiString = emoji?.skins[0].native
    const count = reactionUserNames.length || 0
    // Who reacted, in words: the tooltip for the eye and the name for a screen
    // reader, which otherwise heard an emoji character and a number.
    const who = nameList(reactionUserNames, 5)
    const label = `${emoji?.name ?? "Reaction"}: ${count} ${count === 1 ? "person" : "people"}${who ? ` (${who})` : ""}. ${isSelected ? "Remove your reaction" : "Add your reaction"}`

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
                        aria-label={label}
                        aria-pressed={isSelected}
                        // Your own reaction sits on the soft accent ground, the
                        // same mark as the current item in the sidebar. It was a
                        // raw blue, the only blue in a graphite and orange UI.
                        className={cn(
                            "h-6 gap-1 rounded-md px-1.5 transition-colors",
                            isSelected && "border-brand/40 bg-brand-muted text-foreground hover:bg-brand-muted",
                        )}
                    >
                        <span className="text-base leading-none" aria-hidden="true">{emojiString}</span>
                        <span className="text-xs font-medium tabular-nums">{count}</span>
                    </Button>
                </TooltipTrigger>
                <TooltipContent>
                    <p className='max-w-64 text-xs'>{who}</p>
                </TooltipContent>
            </Tooltip>
        </div>
    );
}
