import {Button} from "@/components/ui/button";
import Image from "next/image";
import addEmojiIconSrc from "@/assets/addEmoji.svg";
import {ReactionPicker} from "@/components/reactionPicker/reactionPicker";
import {ReactionDataInterface, StandardReaction, SyncCustomReaction} from "@/types/reaction";
import {SearchIndex} from "emoji-mart";

interface hoverReactionPickerProps {
    onReactionIdSelected: (reactionId: string) => void;
    setPopupState?: (state: boolean) => void
}
export const HoverReactionPicker = ({onReactionIdSelected, setPopupState}: hoverReactionPickerProps) => {

    const onReactionSelect = async (reaction: StandardReaction | SyncCustomReaction) => {

        onReactionIdSelected(reaction.id);

    }


    return(
        <ReactionPicker showCustomReactions={false} onReactionSelect={onReactionSelect} setPopupState={setPopupState}>
            <Button variant="ghost" size="icon" aria-label="Pick a reaction" className="h-8 w-8">

                <Image src={addEmojiIconSrc || "/placeholder.svg?height=24&width=24"} alt="Add Emoji"  className='h-4 w-4' />
            </Button>
        </ReactionPicker>
    )
}