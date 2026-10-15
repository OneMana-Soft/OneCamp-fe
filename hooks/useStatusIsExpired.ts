import { useEffect, useState } from 'react'
import { UserEmojiStatus} from "@/types/user";

const isPast = (expiresAt?: string | null) => {
    if (!expiresAt) return false
    const at = new Date(expiresAt).getTime()
    return !Number.isNaN(at) && at < Date.now()
}

/**
 * Whether a status has run out, checked again each minute. It is checked
 * again whenever the status's end changes: it once looked only at its "Clear
 * after" choice, and its timer kept the first status it was given, so after
 * a status ran out, a new one with the same choice read as run out too and
 * stayed hidden until the page was loaded again.
 */
export function useStatusIsExpired(status?: UserEmojiStatus | null) {
    const expiresAt = status?.status_user_emoji_expiry_at

    const [isExpired, setIsExpired] = useState(() => isPast(expiresAt))

    useEffect(() => {
        setIsExpired(isPast(expiresAt))

        const interval = setInterval(() => {
            setIsExpired(isPast(expiresAt))
        }, 1000 * 60)

        return () => clearInterval(interval)
    }, [expiresAt])

    return isExpired
}
