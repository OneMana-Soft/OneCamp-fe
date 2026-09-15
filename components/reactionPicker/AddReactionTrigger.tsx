"use client"

import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
import {ReactionPicker} from "@/components/reactionPicker/reactionPicker";
import {useTooltipWithPicker} from "@/components/reactionPicker/useTooltipWithPicker";
import {Button} from "@/components/ui/button";
import Image from "next/image";
import addEmojiIconSrc from "@/assets/addEmoji.svg";
import {cn} from "@/lib/utils/helpers/cn";

interface AddReactionTriggerProps {
    onReactionSelect: (id: string) => void
    showCustomReactions?: boolean
    setPopupState?: (open: boolean) => void
    size?: "sm" | "md"
    variant?: "ghost" | "outline"
}

export const AddReactionTrigger = ({ onReactionSelect, showCustomReactions = false, setPopupState, size = "md", variant = "ghost" }: AddReactionTriggerProps) => {
    const { tooltipOpen, onTooltipChange, onPickerOpenChange, onSelect, onTriggerMouseLeave } = useTooltipWithPicker({ onExternalPopupStateChange: setPopupState })

    return (
        <Tooltip open={tooltipOpen} onOpenChange={onTooltipChange}>
            <ReactionPicker
                showCustomReactions={showCustomReactions}
                onReactionSelect={(reaction)=>{ onReactionSelect(reaction.id); onSelect() }}
                setPopupState={onPickerOpenChange}
            >
                <TooltipTrigger asChild>
                    <Button
                        variant={variant}
                        size="icon"
                        aria-label="Add a reaction"
                        className={cn(size === "sm" ? "h-6 w-6 mt-1 md:mt-0 rounded-full" : "h-8 w-8")}
                        onMouseLeave={onTriggerMouseLeave}
                    >
                        <Image src={addEmojiIconSrc || "/placeholder.svg?height=24&width=24"} alt="Add Emoji"  className={'h-4 w-4 md:h-3.5 md:w-3.5'} />
                    </Button>
                </TooltipTrigger>
            </ReactionPicker>
            <TooltipContent className="flex items-center gap-4">
                <span className="ml-auto">{"Add reaction"}</span>
            </TooltipContent>
        </Tooltip>
    )
}


