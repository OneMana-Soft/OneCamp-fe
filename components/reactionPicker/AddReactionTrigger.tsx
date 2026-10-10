"use client"

import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
import {ReactionPicker} from "@/components/reactionPicker/reactionPicker";
import {useTooltipWithPicker} from "@/components/reactionPicker/useTooltipWithPicker";
import {Button} from "@/components/ui/button";
import {SmilePlus} from "@/lib/icons";
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
                        className={cn(size === "sm" ? "h-6 w-7 rounded-md" : "h-8 w-8")}
                        onMouseLeave={onTriggerMouseLeave}
                    >
                        <SmilePlus aria-hidden="true" className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
                    </Button>
                </TooltipTrigger>
            </ReactionPicker>
            <TooltipContent className="flex items-center gap-4">
                <span className="ml-auto">{"Add reaction"}</span>
            </TooltipContent>
        </Tooltip>
    )
}


