/**
 * Hook for displaying relative time like "2 min ago", "Just now"
 */
"use client"

import * as React from 'react'

export function useRelativeTime(date: Date | string | null) {
  const [relative, setRelative] = React.useState<string>('')

  const compute = React.useCallback((d: Date | string | null) => {
    if (!d) return ''
    const then = typeof d === 'string' ? new Date(d) : d
    const now = new Date()
    const diffMs = now.getTime() - then.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHour = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHour / 24)

    if (diffSec < 10) return 'Just now'
    if (diffSec < 60) return `${diffSec}s ago`
    if (diffMin < 2) return '1 min ago'
    if (diffMin < 60) return `${diffMin} min ago`
    if (diffHour < 2) return '1 hour ago'
    if (diffHour < 24) return `${diffHour} hours ago`
    if (diffDay < 2) return 'Yesterday'
    if (diffDay < 7) return `${diffDay} days ago`

    return then.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: then.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    })
  }, [])

  React.useEffect(() => {
    setRelative(compute(date))
    // Update every minute for recent times
    const timer = setInterval(() => {
      setRelative(compute(date))
    }, 60000)
    return () => clearInterval(timer)
  }, [date, compute])

  return relative
}
