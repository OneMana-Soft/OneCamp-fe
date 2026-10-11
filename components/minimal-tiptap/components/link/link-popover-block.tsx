"use client"

import * as React from 'react'
import { Check, Copy, ExternalLink, Pencil, Unlink } from '@/lib/icons'
import { FloatingBar, FloatingBarButton, FloatingBarDivider } from '@/components/ui/FloatingBar'
import { isSafeHref } from '@/lib/utils/safeHref'

interface LinkPopoverBlockProps {
  url: string
  onClear: () => void
  onEdit: (e: React.MouseEvent<HTMLButtonElement>) => void
}

/** "example.com/path", the link as a reader recognises it. */
function shortUrl(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname === '/' ? '' : u.pathname
    return `${u.hostname.replace(/^www\./, '')}${path}`
  } catch {
    return url
  }
}

/**
 * The link bubble (content.md D25): the area's FloatingBar with where the
 * link goes (opens it) and then edit, copy and remove.
 */
export const LinkPopoverBlock: React.FC<LinkPopoverBlockProps> = ({ url, onClear, onEdit }) => {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
      navigator.clipboard
        .writeText(url)
        .then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        })
        .catch(console.error)
    },
    [url]
  )

  // The href comes from the document, where a collaborator's edit can put one
  // that was never parsed, so it's checked as the rendered link is.
  const handleOpenLink = React.useCallback(() => {
    if (!isSafeHref(url)) return
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [url])

  return (
    <FloatingBar label="Link" data-link-bubble="">
      <FloatingBarButton label={`Open ${url}`} onClick={handleOpenLink} className="max-w-[240px] gap-1.5 px-2 font-[450] text-brand-text">
        <ExternalLink />
        <span className="truncate">{shortUrl(url)}</span>
      </FloatingBarButton>
      <FloatingBarDivider />
      <FloatingBarButton label="Edit link" onClick={onEdit}>
        <Pencil />
      </FloatingBarButton>
      <FloatingBarButton label={copied ? 'Copied' : 'Copy link'} onClick={handleCopy}>
        {copied ? <Check /> : <Copy />}
      </FloatingBarButton>
      <FloatingBarButton label="Remove link" onClick={onClear}>
        <Unlink />
      </FloatingBarButton>
    </FloatingBar>
  )
}
