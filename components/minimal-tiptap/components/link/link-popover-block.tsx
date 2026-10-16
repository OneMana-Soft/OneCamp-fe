"use client"

import * as React from 'react'
import { Check, Copy, ExternalLink, Pencil, Unlink } from '@/lib/icons'
import { FloatingBar, FloatingBarButton, FloatingBarDivider } from '@/components/ui/FloatingBar'
import { isSafeHref } from '@/lib/utils/safeHref'

interface LinkPopoverBlockProps {
  url: string
  /** Absent for a reader: the bar opens and copies, and changes nothing. */
  onClear?: () => void
  onEdit?: () => void
  onOpen: () => void
  /** Escape: the bar goes, and the focus goes back to the text (N48). */
  onEscape: () => void
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
 * The link bar (content.md D25): the area's FloatingBar with where the link
 * goes (opens it) and then edit, copy and remove for someone who can edit.
 */
export const LinkPopoverBlock: React.FC<LinkPopoverBlockProps> = ({ url, onClear, onEdit, onOpen, onEscape }) => {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = React.useCallback(() => {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      })
      .catch(() => {})
  }, [url])

  return (
    <FloatingBar label="Link" data-link-bubble="" onEscape={onEscape}>
      <FloatingBarButton label={`Open ${url}`} onClick={onOpen} disabled={!isSafeHref(url)} className="max-w-[240px] gap-1.5 px-2 font-[450] text-brand-text">
        <ExternalLink />
        <span className="truncate">{shortUrl(url)}</span>
      </FloatingBarButton>
      <FloatingBarDivider />
      {onEdit ? (
        <FloatingBarButton label="Edit link" onClick={onEdit}>
          <Pencil />
        </FloatingBarButton>
      ) : null}
      <FloatingBarButton label={copied ? 'Copied' : 'Copy link'} onClick={handleCopy}>
        {copied ? <Check /> : <Copy />}
      </FloatingBarButton>
      {onClear ? (
        <FloatingBarButton label="Remove link" onClick={onClear}>
          <Unlink />
        </FloatingBarButton>
      ) : null}
    </FloatingBar>
  )
}
