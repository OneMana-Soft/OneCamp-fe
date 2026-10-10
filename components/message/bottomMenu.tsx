
import {ReactionPill} from "@/components/message/reactionPill";
import {useState} from "react";
import {AddReactionTrigger} from "@/components/reactionPicker/AddReactionTrigger";

interface BottomMenuProps {
    reactions: { [key: string]: string[] };
    handleEmojiClick: (id: string) => void
    selectedEmojiId: string
}





export const BottomMenu = ({reactions, handleEmojiClick, selectedEmojiId}: BottomMenuProps) => {

    const [isTooltipOpen, setIsTooltipOpen] = useState(false)
    const [isEmojiPopupOpen, setIsEmojiPopupOpen] = useState(false)
    const [suppressUntilLeave, setSuppressUntilLeave] = useState(false)
    return(
        <div>
            {/* 6px under whatever is above, as the cards and the reply count
                are: it had no margin, so it sat 16px under a picture (the
                attachments' own margin) and touched everything else. */}
            {Object.keys(reactions).length > 0 && <div data-reactions="" className='mt-1.5 flex items-center justify-start gap-2'>
                { Object.entries(reactions).map(([emojiId, userNames]) => (
                    <ReactionPill key={emojiId} emojiId={emojiId} reactionUserNames={userNames}
                                      onClickEmoji={handleEmojiClick} isSelected={selectedEmojiId == emojiId}/>
                ))}
                <AddReactionTrigger onReactionSelect={(id)=>{ handleEmojiClick(id) }} showCustomReactions={false} size="sm" variant="outline" />
            </div>}

        </div>
    )

}