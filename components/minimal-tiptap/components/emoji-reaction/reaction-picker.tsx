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
}

const EmojiReactionPicker = ({ editor, size, variant }: EmojiReactionPickerProps) => {

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
            >
                <Smile className="size-5" />
            </ToolbarButton>

        </ReactionPicker>
    )
}

export { EmojiReactionPicker }
