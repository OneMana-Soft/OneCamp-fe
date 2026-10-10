"use client"
import { displayNameOf } from "@/lib/personName"
import { cn } from "@/lib/utils/helpers/cn"
import { nameList } from "@/lib/utils/format/nameList"
import {UserProfileDataInterface} from "@/types/user";
import {TypingAvatar} from "@/components/typingIndicator/typinngAvatar";
import { AnimatePresence, motion } from "framer-motion"

interface TypingIndicatorProps {
    users: UserProfileDataInterface[]
    className?: string
}

export function TypingIndicator({ users, className }: TypingIndicatorProps) {
    const getTypingText = () => nameList(users.map((u) => displayNameOf(u)))

    const renderAvatars = () => {
        const displayUsers = users.slice(0, 3) // Show max 3 avatars

        return (
            <div className="flex -space-x-1.5">
                {displayUsers.map((user, i) => (
                    <div key={user.user_uuid} className="relative border-[1.5px] border-background rounded-full" style={{ zIndex: 10 - i }}>
                         <TypingAvatar userName={displayNameOf(user)} userProfileObjKey={user.user_profile_object_key}/>
                    </div>
                ))}
                {users.length > 3 && (
                    <div className="w-5 h-5 rounded-full bg-muted border-[1.5px] border-background flex items-center justify-center z-0">
                        <span className="text-2xs font-bold text-muted-foreground">+{users.length - 3}</span>
                    </div>
                )}
            </div>
        )
    }

    return (
        <AnimatePresence>
            {users && users.length > 0 && (
                <motion.div
                    // Fades in place: a springing, scaling pill drew the eye
                    // every time someone touched a key in the channel.
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
                    className={cn(
                        // inline-flex + w-fit keeps the pill compact instead
                        // of stretching to fill its parent on mobile, which
                        // looked like a clunky full-width banner.
                        "inline-flex w-fit max-w-full items-center gap-1.5 px-2.5 py-1 text-xs text-muted-foreground bg-background rounded-md border border-border/60 overflow-hidden",
                        className,
                    )}
                    role="status"
                    aria-live="polite"
                    aria-label={`${getTypingText()} ${users.length === 1 ? "is" : "are"} typing`}
                >
                    {renderAvatars()}

                    <div className="flex items-center gap-1 px-0.5">
                        <div className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full motion-safe:animate-bounce [animation-delay:-0.3s]" />
                        <div className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full motion-safe:animate-bounce [animation-delay:-0.15s]" />
                        <div className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full motion-safe:animate-bounce" />
                    </div>

                    <span className="font-medium whitespace-nowrap pl-1 truncate max-w-[110px] sm:max-w-[200px]">{getTypingText()}</span>
                    <span className="whitespace-nowrap">
                        {users.length === 1 ? "is typing…" : "are typing…"}
                    </span>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
