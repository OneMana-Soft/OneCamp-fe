"use client"

import type { Editor } from '@tiptap/react'
import type { VariantProps } from 'class-variance-authority'
import type { toggleVariants } from '@/components/ui/toggle'
import { ToolbarButton } from '../toolbar-button'
import { Smile } from "@/lib/icons";
import {ReactionPicker} from "@/components/reactionPicker/reactionPicker";
import { StandardReaction, SyncCustomReaction} from "@/types/reaction";


interface EmojiReactionPickerProps extends VariantProps<typeof toggleVariants> {
    editor: Editor
    /** The trigger's look where a surface draws it (the chat composer's 28px tool). */
    className?: string
}

const EmojiReactionPicker = ({ editor, size, variant, className }: EmojiReactionPickerProps) => {

    const onReactionSelect = async (reaction: StandardReaction | SyncCustomReaction) => {

        editor.commands.insertContent(reaction.native || "");

    }

    return (
        <ReactionPicker showCustomReactions={false} onReactionSelect={onReactionSelect}>

            <ToolbarButton
                isActive={editor.isActive('emoji')}
                tooltip="Emoji"
                aria-label="Insert emoji"
                disabled={editor.isActive('emojiPicker')}
                size={size}
                variant={variant}
                className={className}
            >
                {/* 16px with the toolbar's stroke, as its neighbours: at 20px it made
                    this one button 36px wide in a row of 32px ones. */}
                <Smile className="size-4" />
            </ToolbarButton>

        </ReactionPicker>
    )
}

export { EmojiReactionPicker }
