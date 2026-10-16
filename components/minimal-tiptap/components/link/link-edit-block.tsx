"use client"

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils/helpers/cn'
import { isSafeHref } from '@/lib/utils/safeHref'

interface LinkEditorProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultUrl?: string
  defaultText?: string
  onSave: (url: string, text?: string) => void
  /** Leaves the form with nothing changed (Cancel, Escape). */
  onCancel?: () => void
}

/**
 * The link's form: where it goes and what it says, Save and Cancel (N48).
 * There is no "open in a new tab" switch (D25): a link to another site always
 * opens in a new tab, and the app's own links in the app.
 */
export const LinkEditBlock = React.forwardRef<HTMLDivElement, LinkEditorProps>(({ onSave, onCancel, defaultUrl, defaultText, className }, ref) => {
  const formRef = React.useRef<HTMLFormElement>(null)
  const urlRef = React.useRef<HTMLInputElement>(null)
  const [url, setUrl] = React.useState(defaultUrl || '')
  const [text, setText] = React.useState(defaultText || '')
  const id = React.useId()

  React.useEffect(() => {
    urlRef.current?.focus()
    urlRef.current?.select()
  }, [])

  const handleSave = React.useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      // A type="url" field accepts any scheme, "javascript:" too.
      urlRef.current?.setCustomValidity(!url || isSafeHref(url) ? '' : 'Use a web (https://), email (mailto:) or phone (tel:) link')
      if (formRef.current?.reportValidity()) onSave(url.trim(), text)
    },
    [onSave, url, text],
  )

  React.useImperativeHandle(ref, () => formRef.current as unknown as HTMLDivElement)

  return (
    <form
      ref={formRef}
      onSubmit={handleSave}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          onCancel?.()
        }
      }}
      className={cn('space-y-3', className)}
    >
      <div className="space-y-1">
        <Label htmlFor={`${id}-url`} className="text-meta font-medium text-ink-2">
          Link
        </Label>
        <Input
          id={`${id}-url`}
          ref={urlRef}
          type="url"
          required
          placeholder="https://"
          dense
          value={url}
          onChange={(e) => {
            e.target.setCustomValidity('')
            setUrl(e.target.value)
          }}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor={`${id}-text`} className="text-meta font-medium text-ink-2">
          Text
        </Label>
        <Input id={`${id}-text`} dense type="text" placeholder="What the link says" value={text} onChange={(e) => setText(e.target.value)} />
      </div>

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" size="sm">
          Save
        </Button>
      </div>
    </form>
  )
})

LinkEditBlock.displayName = 'LinkEditBlock'
