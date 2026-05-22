"use client"
import { cn } from "@/lib/utils/helpers/cn"
import {UserProfileDataInterface} from "@/types/user";
import {TypingAvatar} from "@/components/typingIndicator/typinngAvatar";
import { AnimatePresence, motion } from "framer-motion"

interface TypingIndicatorProps {
    users: UserProfileDataInterface[]
    className?: string
}

export function TypingIndicator({ users, className }: TypingIndicatorProps) {
    const getTypingText = () => {
        if (users.length === 1) {
            return users[0].user_name
        } else if (users.length === 2) {
            return `${users[0].user_name}, ${users[1].user_name}`
        } else {
            return `${users[0].user_name} and ${users.length - 1} other${users.length > 2 ? "s" : ""}`
        }
    }

    const renderAvatars = () => {
        const displayUsers = users.slice(0, 3) // Show max 3 avatars

        return (
            <div className="flex -space-x-1.5 border-r border-border/50 pr-2 mr-1">
                {displayUsers.map((user, i) => (
                    <div key={user.user_uuid} className="relative border-[1.5px] border-background rounded-full" style={{ zIndex: 10 - i }}>
                         <TypingAvatar userName={user.user_name} userProfileObjKey={user.user_profile_object_key}/>
                    </div>
                ))}
                {users.length > 3 && (
                    <div className="w-5 h-5 rounded-full bg-muted border-[1.5px] border-background flex items-center justify-center z-0">
                        <span className="text-[8px] font-bold text-muted-foreground">+{users.length - 3}</span>
                    </div>
                )}
            </div>
        )
    }

    return (
        <AnimatePresence>
            {users && users.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 15, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95, transition: { duration: 0.2 } }}
                    transition={{ duration: 0.3, type: "spring", bounce: 0.25 }}
                    className={cn(
                        // inline-flex + w-fit keeps the pill compact instead
                        // of stretching to fill its parent on mobile, which
                        // looked like a clunky full-width banner.
                        "inline-flex w-fit max-w-full items-center gap-1.5 px-2.5 py-1 text-xs text-muted-foreground bg-background/90 backdrop-blur-md rounded-full border border-border/50 shadow-sm overflow-hidden",
                        className,
                    )}
                    role="status"
                    aria-live="polite"
                    aria-label={`${getTypingText()} ${users.length === 1 ? "is" : "are"} typing`}
                >
                    {renderAvatars()}

                    <div className="flex items-center gap-1 px-0.5">
                        <div className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <div className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <div className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" />
                    </div>

                    <span className="font-medium whitespace-nowrap pl-1 truncate max-w-[110px] sm:max-w-[200px]">{getTypingText()}</span>
                    <span className="text-muted-foreground/60 italic whitespace-nowrap">
                        {users.length === 1 ? "is typing…" : "are typing…"}
                    </span>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
