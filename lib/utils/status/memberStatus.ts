import {StatusTime} from "@/types/user";

function getRelativeTime(time: number) {
    const parts: string[] = []

    const totalMinutes = Math.ceil(time / (1000 * 60))

    const days = Math.floor(totalMinutes / (60 * 24))
    const hours = Math.floor(totalMinutes / 60) - days * 24
    const minutes = totalMinutes % 60

    if (days > 0) {
        parts.push(`${days}d`)
    }
    if (days > 0 || hours > 0) {
        parts.push(`${hours}h`)
    }
    if (minutes > 0) {
        parts.push(`${minutes}m`)
    }

    return parts.join(' ')
}

function getExpiration(expiresIn: StatusTime) {
    switch (expiresIn) {
        case '30m': {
            return new Date(Date.now() + 30 * 60 * 1000)
        }
        case '1h': {
            return new Date(Date.now() + 60 * 60 * 1000)
        }
        case '4h': {
            return new Date(Date.now() + 4 * 60 * 60 * 1000)
        }
        case 'today': {
            const date = new Date()

            // Set to end of day in local timezone
            date.setHours(23, 59, 59, 999)
            return date
        }
        case 'this_week': {
            const date = new Date()

            // Set to end of week in local timezone
            date.setDate(date.getDate() + (7 - date.getDay()))
            date.setHours(23, 59, 59, 999)
            return date
        }
    }
}

export function getTimeRemaining(expiresAt?: string | null) {
    const currentTime = new Date().getTime()
    const todayRemaining = (getExpiration('today')?.getTime() ?? 0) - currentTime
    const timeRemaining = expiresAt ? new Date(expiresAt).getTime() - currentTime : -1

    if (timeRemaining < todayRemaining) {
        return getRelativeTime(timeRemaining)
    }

    if (timeRemaining === todayRemaining) {
        return 'today'
    }

    return getRelativeTime(timeRemaining)
}