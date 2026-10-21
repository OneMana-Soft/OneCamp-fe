"use client"
import { Popover, PopoverTrigger } from "@/components/ui/popover"
import {StandardReaction, SyncCustomReaction} from "@/types/reaction";
import {lazy, Suspense, useRef, useState} from "react";

export interface ReactionPickerPopoverProps {
    showCustomReactions : boolean
    onReactionSelect: (reaction: StandardReaction | SyncCustomReaction) => void
    setPopupState?: (state: boolean) => void
    children: React.ReactNode
}

// The picker loads on first use, asked for as a pointer or the focus reaches its trigger (reactionPickerPanel).
const loadPanel = () => import("@/components/popover/reactionPickerPanel")
const Panel = lazy(loadPanel)
const ahead = () => void loadPanel()

export function ReactionPickerPopover({showCustomReactions, onReactionSelect, setPopupState, children}:ReactionPickerPopoverProps) {

    const triggerRef = useRef<HTMLButtonElement>(null)
    const [popOpened, setPopOpened] = useState(false)
    // Once opened, kept: it plays its closing motion.
    const [used, setUsed] = useState(false)

    const stateChange = (b: boolean) => {

        setPopOpened(b)
        if (b) setUsed(true)

        if(setPopupState) setPopupState(b)
    }

    const handleReactionSelect = (reaction: StandardReaction | SyncCustomReaction) => {
        onReactionSelect(reaction)
        stateChange(false)
    }


    return (
        <Popover open={popOpened} onOpenChange={stateChange} >
            <PopoverTrigger ref={triggerRef} asChild onPointerEnter={ahead} onFocus={ahead}>
                {children}
            </PopoverTrigger>
            {used ? (
                <Suspense fallback={null}>
                    <Panel trigger={triggerRef} open={popOpened} showCustomReactions={showCustomReactions} onReactionSelect={handleReactionSelect} />
                </Suspense>
            ) : null}
        </Popover>
    )
}
