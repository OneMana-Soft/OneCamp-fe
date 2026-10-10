import { SpotWelcome } from "@/components/ui/graphics/spots"
import type { CampHue } from "@/lib/campHue"

/**
 * A conversation with nothing in it yet: the welcome spot in the
 * conversation's own hue (a channel's, or the other person's), then what it
 * is and what to do, sitting just above the message box where the first
 * message will appear. It was two lines of grey text, which read as a list
 * still loading.
 */
export function ConversationEmpty({ hue, title, description }: { hue: CampHue; title: string; description: string }) {
    return (
        <div className="flex h-full flex-col justify-end px-4 pb-4 md:pb-6" data-conversation-empty="">
            <SpotWelcome hue={hue} size={88} className="mb-3 -ml-1" />
            <p className="text-pretty text-sm font-medium text-foreground">{title}</p>
            <p className="max-w-[45ch] text-pretty text-sm text-muted-foreground">{description}</p>
        </div>
    )
}
