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
    /** The trigger's own look, where a surface draws it (the toolbar's 26px button). */
    className?: string
}

export const AddReactionTrigger = ({ onReactionSelect, showCustomReactions = false, setPopupState, size = "md", variant = "ghost", className }: AddReactionTriggerProps) => {
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
                        className={cn(size === "sm" ? "h-6 w-7 rounded-md" : "h-8 w-8", className)}
                        onMouseLeave={onTriggerMouseLeave}
                    >
                        <SmilePlus aria-hidden="true" className={cn("h-4 w-4", className ? "text-current" : "text-muted-foreground")} />
                    </Button>
                </TooltipTrigger>
            </ReactionPicker>
            <TooltipContent className="flex items-center gap-4">
                <span className="ml-auto">{"Add reaction"}</span>
            </TooltipContent>
        </Tooltip>
    )
}


